import {
  downloadBackup,
  shareBackup,
  saveBackupToFolder,
  canSaveToFolder,
} from "../../src/platform/backup";
import { pathRepository } from "../path-fixture";

// Since Expo SDK 58, File.write() is asynchronous. A backup must be fully
// written before the share sheet opens, or an empty file can be shared.
// Only a file Forge wrote to a picked folder and read back counts as a
// confirmed backup; a share is recorded as unconfirmed.

const mockEvents: string[] = [];
const mockWrite: { finish?: () => void; content?: unknown } = {};
const mockShare = { fail: false };
const mockFolder: {
  pick?: () => Promise<unknown>;
  stored?: string;
  readBack?: (written: string) => string;
} = {};
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: jest.fn().mockImplementation((_dir: string, name: string) => ({
    uri: `file:///cache/${name}`,
    exists: false,
    create: jest.fn(),
    delete: jest.fn(),
    write: jest.fn(
      (content: unknown) =>
        new Promise<void>((resolve) => {
          mockEvents.push("write started");
          mockWrite.content = content;
          mockWrite.finish = () => {
            mockEvents.push("write finished");
            resolve();
          };
        }),
    ),
  })),
  Directory: { pickDirectoryAsync: jest.fn(() => mockFolder.pick!()) },
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {
    mockEvents.push("share");
    if (mockShare.fail) throw new Error("Share sheet unavailable");
  }),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

/** A picked folder whose files keep what was written. */
function folder(name = "Downloads") {
  return {
    name,
    createFile: jest.fn((fileName: string, mimeType: string) => ({
      name: fileName,
      type: mimeType,
      write: jest.fn(async (text: string) => {
        mockFolder.stored = text;
      }),
      text: jest.fn(async () =>
        mockFolder.readBack
          ? mockFolder.readBack(mockFolder.stored!)
          : mockFolder.stored!,
      ),
    })),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  mockEvents.length = 0;
  mockShare.fail = false;
  delete mockWrite.finish;
  delete mockFolder.readBack;
  delete mockFolder.stored;
});

test("the share sheet opens only after the backup file is written", async () => {
  const done = downloadBackup('{"version":1}');
  await tick();
  expect(mockEvents).toEqual(["write started"]);
  mockWrite.finish!();
  await done;
  expect(mockEvents).toEqual(["write started", "write finished", "share"]);
  expect(mockWrite.content).toBe('{"version":1}');
});

test("sharing records an unconfirmed share, never a backup", async () => {
  const { r, db } = pathRepository();
  try {
    const sharing = shareBackup(r);
    await tick();
    mockWrite.finish!();
    await sharing;
    expect(JSON.parse(String(mockWrite.content)).version).toBe(1);
    expect(Number(r.setting("lastSharedAt"))).toBeGreaterThan(0);
    expect(r.setting("lastBackupAt")).toBeUndefined();

    // A failed share records nothing.
    r.setSetting("lastSharedAt", "1");
    mockShare.fail = true;
    const failing = shareBackup(r);
    await tick();
    mockWrite.finish!();
    await expect(failing).rejects.toThrow("Share sheet unavailable");
    expect(r.setting("lastSharedAt")).toBe("1");
  } finally {
    db.close();
  }
});

test("saving to a folder writes, reads back and records a confirmed backup", async () => {
  const { r, db } = pathRepository();
  try {
    const picked = folder("primary:Documents");
    mockFolder.pick = async () => picked;
    const result = await saveBackupToFolder(r);
    expect(result).toEqual({ saved: true, folder: "Documents" });
    const [name, mime] = picked.createFile.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(name).toMatch(/^forge-backup-\d{4}-\d{2}-\d{2}-\d+\.json$/);
    expect(mime).toBe("application/json");
    const saved = JSON.parse(mockFolder.stored!);
    expect(saved.version).toBe(1);
    // The confirmed time is when the data was read, not later.
    expect(Number(r.setting("lastBackupAt"))).toBe(saved.exportedAt);
    expect(r.setting("lastSharedAt")).toBeUndefined();
  } finally {
    db.close();
  }
});

test("a cancelled folder picker records nothing", async () => {
  const { r, db } = pathRepository();
  try {
    mockFolder.pick = async () => {
      throw Object.assign(
        new Error("The file picker was cancelled by the user"),
        { code: "ERR_PICKER_CANCELLED" },
      );
    };
    expect(await saveBackupToFolder(r)).toEqual({ saved: false });
    expect(r.setting("lastBackupAt")).toBeUndefined();
  } finally {
    db.close();
  }
});

test("a saved file that does not read back the same is not a backup", async () => {
  const { r, db } = pathRepository();
  try {
    mockFolder.pick = async () => folder();
    mockFolder.readBack = (written) => written.slice(0, 10);
    await expect(saveBackupToFolder(r)).rejects.toThrow(/didn't match/);
    expect(r.setting("lastBackupAt")).toBeUndefined();
  } finally {
    db.close();
  }
});

test("folder saving is offered on Android only", () => {
  // The test environment runs as iOS: iPhones keep the share option until
  // the iOS folder picker is verified on a device.
  expect(canSaveToFolder()).toBe(false);
});
