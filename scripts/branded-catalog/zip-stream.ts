// Streams one member of a large ZIP archive without loading it into memory
// (the Branded Foods JSON expands to 3.3 GB). Reads the central directory
// from the end of the file, then inflates the member as a stream, checking
// its size and CRC-32 at the end. Stored and deflated members only; refuses
// encrypted members, unsafe paths and ZIP64.
import {
  closeSync,
  openSync,
  readSync,
  fstatSync,
  createReadStream,
} from "node:fs";
import { createInterface } from "node:readline";
import { Transform } from "node:stream";
import { crc32, createInflateRaw } from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export type StreamEntry = {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  crc: number;
  offset: number;
};

function read(fd: number, position: number, length: number) {
  const buf = Buffer.alloc(length);
  const n = readSync(fd, buf, 0, length, position);
  return buf.subarray(0, n);
}

/** The members of an archive on disk, from its central directory. */
export function listZipFile(file: string): StreamEntry[] {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const tailLength = Math.min(size, 65_557);
    const tail = read(fd, size - tailLength, tailLength);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--)
      if (tail.readUInt32LE(i) === EOCD) {
        end = i;
        break;
      }
    if (end < 0)
      throw new Error("Not a ZIP archive (no end of central directory)");
    const count = tail.readUInt16LE(end + 10);
    const dirSize = tail.readUInt32LE(end + 12);
    const dirOffset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || dirOffset === 0xffffffff)
      throw new Error("ZIP64 archives are not supported");
    const dir = read(fd, dirOffset, dirSize);
    const entries: StreamEntry[] = [];
    let at = 0;
    for (let n = 0; n < count; n++) {
      if (dir.readUInt32LE(at) !== CENTRAL)
        throw new Error("Corrupt ZIP central directory");
      const nameLength = dir.readUInt16LE(at + 28);
      const extraLength = dir.readUInt16LE(at + 30);
      const commentLength = dir.readUInt16LE(at + 32);
      const entry: StreamEntry = {
        flags: dir.readUInt16LE(at + 8),
        method: dir.readUInt16LE(at + 10),
        crc: dir.readUInt32LE(at + 16),
        compressedSize: dir.readUInt32LE(at + 20),
        size: dir.readUInt32LE(at + 24),
        offset: dir.readUInt32LE(at + 42),
        name: dir.toString("utf8", at + 46, at + 46 + nameLength),
      };
      if ([entry.size, entry.compressedSize, entry.offset].includes(0xffffffff))
        throw new Error(`ZIP64 member not supported: ${entry.name}`);
      if (
        !entry.name ||
        entry.name.includes("\\") ||
        entry.name.startsWith("/") ||
        entry.name.split("/").includes("..")
      )
        throw new Error(`Unsafe ZIP path: ${entry.name}`);
      entries.push(entry);
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    closeSync(fd);
  }
}

/**
 * The lines of one member, streamed. Rejects (after the last line) when the
 * inflated size or CRC-32 does not match the archive's record.
 */
export async function* zipLines(
  file: string,
  entry: StreamEntry,
): AsyncGenerator<string> {
  if (entry.flags & 1) throw new Error(`Encrypted ZIP member: ${entry.name}`);
  if (entry.method !== 0 && entry.method !== 8)
    throw new Error(`Unsupported ZIP method ${entry.method}: ${entry.name}`);
  const fd = openSync(file, "r");
  let start: number;
  try {
    const local = read(fd, entry.offset, 30);
    if (local.readUInt32LE(0) !== LOCAL)
      throw new Error(`Corrupt ZIP local header: ${entry.name}`);
    start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  } finally {
    closeSync(fd);
  }
  let size = 0;
  let crc = 0;
  const check = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      crc = crc32(chunk, crc);
      done(null, chunk);
    },
  });
  const raw = createReadStream(file, {
    start,
    end: start + entry.compressedSize - 1,
    highWaterMark: 1 << 20,
  });
  const body = entry.method === 8 ? raw.pipe(createInflateRaw()) : raw;
  const lines = createInterface({
    input: body.pipe(check),
    crlfDelay: Infinity,
  });
  for await (const line of lines) yield line;
  if (size !== entry.size)
    throw new Error(`Size mismatch in ${entry.name}: ${size} vs ${entry.size}`);
  if (crc >>> 0 !== entry.crc >>> 0)
    throw new Error(`CRC-32 mismatch in ${entry.name}`);
}
