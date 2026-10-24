// A minimal, dependency-free ZIP reader for the pinned USDA archives.
// Supports stored and deflated members only. Refuses encrypted, ZIP64,
// unsafe paths and anything whose size or CRC-32 does not match.
import { crc32, inflateRawSync } from "node:zlib";

export type ZipEntry = {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  crc: number;
  offset: number;
};

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Every member of an archive, from its central directory. */
export function listZip(buf: Buffer): ZipEntry[] {
  const floor = Math.max(0, buf.length - 65_557);
  let end = -1;
  for (let i = buf.length - 22; i >= floor; i--)
    if (buf.readUInt32LE(i) === EOCD) {
      end = i;
      break;
    }
  if (end < 0)
    throw new Error("Not a ZIP archive (no end of central directory)");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff)
    throw new Error("ZIP64 archives are not supported");
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== CENTRAL)
      throw new Error("Corrupt ZIP central directory");
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const entry: ZipEntry = {
      flags: buf.readUInt16LE(at + 8),
      method: buf.readUInt16LE(at + 10),
      crc: buf.readUInt32LE(at + 16),
      compressedSize: buf.readUInt32LE(at + 20),
      size: buf.readUInt32LE(at + 24),
      offset: buf.readUInt32LE(at + 42),
      name: buf.toString("utf8", at + 46, at + 46 + nameLength),
    };
    if (
      entry.size === 0xffffffff ||
      entry.compressedSize === 0xffffffff ||
      entry.offset === 0xffffffff
    )
      throw new Error(`ZIP64 member not supported: ${entry.name}`);
    if (!safeName(entry.name))
      throw new Error(`Unsafe ZIP path: ${entry.name}`);
    entries.push(entry);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function safeName(name: string) {
  return (
    !!name &&
    !name.includes("\\") &&
    !name.startsWith("/") &&
    !/^[a-z]:/i.test(name) &&
    !name.split("/").includes("..")
  );
}

/** The bytes of one member, verified against its recorded size and CRC-32. */
export function readZipEntry(buf: Buffer, entry: ZipEntry, maxBytes: number) {
  if (entry.flags & 1) throw new Error(`Encrypted ZIP member: ${entry.name}`);
  if (entry.size > maxBytes)
    throw new Error(
      `${entry.name} expands to ${entry.size} bytes (limit ${maxBytes})`,
    );
  if (buf.readUInt32LE(entry.offset) !== LOCAL)
    throw new Error(`Corrupt ZIP local header: ${entry.name}`);
  const start =
    entry.offset +
    30 +
    buf.readUInt16LE(entry.offset + 26) +
    buf.readUInt16LE(entry.offset + 28);
  const packed = buf.subarray(start, start + entry.compressedSize);
  let data: Buffer;
  if (entry.method === 0) data = Buffer.from(packed);
  else if (entry.method === 8)
    data = inflateRawSync(packed, { maxOutputLength: maxBytes });
  else throw new Error(`Unsupported ZIP method ${entry.method}: ${entry.name}`);
  if (data.length !== entry.size)
    throw new Error(`Size mismatch in ${entry.name}`);
  if (crc32(data) >>> 0 !== entry.crc >>> 0)
    throw new Error(`CRC-32 mismatch in ${entry.name}`);
  return data;
}
