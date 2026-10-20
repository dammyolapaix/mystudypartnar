import { afterEach, expect, test, vi } from "vitest";
import { createSources, listSources, type SourceStorage } from "./sources";
import { createUser, removeUser } from "./test-users";

vi.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  updateTag: () => {},
}));

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const FIFTEEN_MINUTES = 15 * 60;
const fixtureUsers: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureUsers.splice(0).map((id) => removeUser(id)));
});

test("a signed-out visitor is refused", async () => {
  const sources = createSources({ storage: memoryStorage(), secret: "test-secret" });

  expect(
    await sources.requestUpload(null, {
      filename: "lecture.pdf",
      byteLength: 12,
    }),
  ).toEqual({ error: "Not authenticated" });

  expect(
    await sources.confirmUpload(null, { confirmation: "upload" }),
  ).toEqual({ error: "Not authenticated" });
});

test("a file of the wrong type never becomes a source", async () => {
  const userId = crypto.randomUUID();
  const sources = createSources({ storage: memoryStorage(), secret: "test-secret" });

  expect(
    await sources.requestUpload(
      { id: userId },
      { filename: "grades.xlsx", byteLength: 32 },
    ),
  ).toEqual({ error: "This file type is not allowed" });

  expect(await listSources(userId)).toEqual([]);
});

test("an empty file never becomes a source", async () => {
  const userId = crypto.randomUUID();
  const sources = createSources({ storage: memoryStorage(), secret: "test-secret" });

  expect(
    await sources.requestUpload(
      { id: userId },
      { filename: "lecture.pdf", byteLength: 0 },
    ),
  ).toEqual({ error: "File is empty" });

  expect(await listSources(userId)).toEqual([]);
});

test("a file over 50 MB never becomes a source", async () => {
  const userId = crypto.randomUUID();
  const sources = createSources({ storage: memoryStorage(), secret: "test-secret" });

  expect(
    await sources.requestUpload(
      { id: userId },
      { filename: "lecture.pdf", byteLength: MAX_SOURCE_BYTES + 1 },
    ),
  ).toEqual({ error: "File is over 50 MB" });

  expect(await listSources(userId)).toEqual([]);
});

test("an upload url lasts 15 minutes, caps the body at the file size, and writes only that source key", async () => {
  const userId = crypto.randomUUID();
  const storage = memoryStorage();
  const sources = createSources({ storage, secret: "test-secret" });
  const pdf = file("%PDF-1.4\n");

  const grant = await sources.requestUpload(
    { id: userId },
    { filename: "lecture.pdf", byteLength: pdf.byteLength },
  );

  expect(grant).toMatchObject({
    expiresInSeconds: FIFTEEN_MINUTES,
    contentLength: pdf.byteLength,
  });
  if (!("uploadUrl" in grant)) {
    throw new Error("Expected an upload url");
  }

  const url = new URL(grant.uploadUrl);
  expect(decodeURIComponent(url.pathname)).toBe(
    `/sources/${userId}/${grant.sourceId}`,
  );
  expect(url.searchParams.get("content-length")).toBe(String(pdf.byteLength));
  expect(await listSources(userId)).toEqual([]);
});

test("a file of exactly 50 MB is accepted for upload", async () => {
  const userId = crypto.randomUUID();
  const sources = createSources({ storage: memoryStorage(), secret: "test-secret" });

  const grant = await sources.requestUpload(
    { id: userId },
    { filename: "lecture.pdf", byteLength: MAX_SOURCE_BYTES },
  );

  expect(grant).toMatchObject({
    contentLength: MAX_SOURCE_BYTES,
    expiresInSeconds: FIFTEEN_MINUTES,
  });
  expect(await listSources(userId)).toEqual([]);
});

test("a checked upload becomes a preparing source owned by that student", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const sources = createSources({ storage, secret: "test-secret" });
  const pdf = file("%PDF-1.4\nlecture");

  const uploaded = await confirmFile(sources, storage, student.id, "lecture.pdf", pdf);

  expect(uploaded).toEqual({
    source: {
      id: expect.any(String),
      filename: "lecture.pdf",
      status: "preparing",
      userId: student.id,
    },
  });
  if (!("source" in uploaded)) {
    throw new Error("Expected a source");
  }
  expect(await listSources(student.id)).toEqual([uploaded.source]);
});

test("pdf, doc, docx, ppt, and pptx files can become preparing sources", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const sources = createSources({ storage, secret: "test-secret" });
  const files = [
    ["slides.pptx", file([0x50, 0x4b, 0x03, 0x04], "ppt/presentation.xml")],
    ["notes.docx", file([0x50, 0x4b, 0x03, 0x04], "word/document.xml")],
    ["deck.ppt", ole("PowerPoint Document")],
    ["essay.doc", ole("WordDocument")],
    ["Lecture.PDF", file("%PDF-1.4\n")],
  ] as const;

  const created = [];
  for (const [filename, bytes] of files) {
    const uploaded = await confirmFile(sources, storage, student.id, filename, bytes);
    if (!("source" in uploaded)) {
      throw new Error(`Expected ${filename} to become a source`);
    }
    created.push(uploaded.source);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  expect(await listSources(student.id)).toEqual([...created].reverse());
  expect(created.map((source) => source.status)).toEqual([
    "preparing",
    "preparing",
    "preparing",
    "preparing",
    "preparing",
  ]);
});

test("bytes that do not match the type never become a source", async () => {
  const student = { id: crypto.randomUUID() };
  const storage = memoryStorage();
  const sources = createSources({ storage, secret: "test-secret" });

  const renamedArchive = await confirmFile(
    sources,
    storage,
    student.id,
    "notes.docx",
    file([0x50, 0x4b, 0x03, 0x04], "readme.txt"),
  );
  const pdfNamedAsDoc = await confirmFile(
    sources,
    storage,
    student.id,
    "essay.doc",
    file("%PDF-1.4\n"),
  );
  const wordNamedAsPpt = await confirmFile(
    sources,
    storage,
    student.id,
    "deck.ppt",
    ole("WordDocument"),
  );

  expect(renamedArchive).toEqual({ error: "This file does not match its type" });
  expect(pdfNamedAsDoc).toEqual({ error: "This file does not match its type" });
  expect(wordNamedAsPpt).toEqual({ error: "This file does not match its type" });
  expect(await listSources(student.id)).toEqual([]);
});

test("a missing, empty, or oversized object never becomes a source", async () => {
  const student = { id: crypto.randomUUID() };
  const storage = memoryStorage();
  const sources = createSources({ storage, secret: "test-secret" });
  const pdf = file("%PDF-1.4\n");

  const missing = await sources.requestUpload(
    { id: student.id },
    { filename: "missing.pdf", byteLength: pdf.byteLength },
  );
  if (!("confirmation" in missing)) {
    throw new Error("Expected an upload url");
  }

  const empty = await sources.requestUpload(
    { id: student.id },
    { filename: "empty.pdf", byteLength: pdf.byteLength },
  );
  if (!("confirmation" in empty)) {
    throw new Error("Expected an upload url");
  }
  storage.put(objectKey(empty.uploadUrl), pdf, 0);

  const oversized = await sources.requestUpload(
    { id: student.id },
    { filename: "large.pdf", byteLength: pdf.byteLength },
  );
  if (!("confirmation" in oversized)) {
    throw new Error("Expected an upload url");
  }
  storage.put(objectKey(oversized.uploadUrl), pdf, MAX_SOURCE_BYTES + 1);

  expect(
    await sources.confirmUpload(
      { id: student.id },
      { confirmation: missing.confirmation },
    ),
  ).toEqual({ error: "This upload was not found" });
  expect(
    await sources.confirmUpload(
      { id: student.id },
      { confirmation: empty.confirmation },
    ),
  ).toEqual({ error: "File is empty" });
  expect(
    await sources.confirmUpload(
      { id: student.id },
      { confirmation: oversized.confirmation },
    ),
  ).toEqual({ error: "File is over 50 MB" });
  expect(await listSources(student.id)).toEqual([]);
});

test("an upload expires after 15 minutes", async () => {
  const student = { id: crypto.randomUUID() };
  const storage = memoryStorage();
  let now = 1_700_000_000_000;
  const sources = createSources({
    storage,
    secret: "test-secret",
    now: () => now,
  });
  const pdf = file("%PDF-1.4\n");
  const grant = await sources.requestUpload(
    { id: student.id },
    { filename: "lecture.pdf", byteLength: pdf.byteLength },
  );
  if (!("confirmation" in grant)) {
    throw new Error("Expected an upload url");
  }

  storage.put(objectKey(grant.uploadUrl), pdf);
  now += FIFTEEN_MINUTES * 1000;

  expect(
    await sources.confirmUpload(
      { id: student.id },
      { confirmation: grant.confirmation },
    ),
  ).toEqual({ error: "This upload has expired" });
  expect(await listSources(student.id)).toEqual([]);
});

test("a student sees only their own sources, newest first, and may reuse a filename", async () => {
  const student = await createUser();
  const other = await createUser();
  fixtureUsers.push(student.id, other.id);
  const storage = memoryStorage();
  const sources = createSources({ storage, secret: "test-secret" });
  const pdf = file("%PDF-1.4\n");

  const first = await confirmFile(sources, storage, student.id, "notes.pdf", pdf);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await confirmFile(
    sources,
    storage,
    student.id,
    "notes.pdf",
    file("%PDF-1.7\n"),
  );
  await confirmFile(sources, storage, other.id, "other.pdf", pdf);

  if (!("source" in first) || !("source" in second)) {
    throw new Error("Expected both uploads to become sources");
  }

  expect(await listSources(student.id)).toEqual([second.source, first.source]);
  expect(await listSources(other.id)).toEqual([
    expect.objectContaining({
      filename: "other.pdf",
      userId: other.id,
      status: "preparing",
    }),
  ]);
});

test("another student cannot confirm an upload they do not own", async () => {
  const student = { id: crypto.randomUUID() };
  const other = { id: crypto.randomUUID() };
  const storage = memoryStorage();
  const sources = createSources({ storage, secret: "test-secret" });
  const pdf = file("%PDF-1.4\n");
  const grant = await sources.requestUpload(
    { id: student.id },
    { filename: "lecture.pdf", byteLength: pdf.byteLength },
  );
  if (!("confirmation" in grant)) {
    throw new Error("Expected an upload url");
  }
  storage.put(objectKey(grant.uploadUrl), pdf);

  expect(
    await sources.confirmUpload(
      { id: other.id },
      { confirmation: grant.confirmation },
    ),
  ).toEqual({ error: "This upload was not found" });
  expect(await listSources(student.id)).toEqual([]);
  expect(await listSources(other.id)).toEqual([]);
});

type MemoryStorage = SourceStorage & {
  put: (key: string, bytes: Uint8Array, contentLength?: number) => void;
};

function memoryStorage(): MemoryStorage {
  const objects = new Map<string, { bytes: Uint8Array; contentLength: number }>();

  return {
    async createUploadUrl({ key, contentLength, expiresInSeconds }) {
      const url = new URL(`https://storage.test/${key}`);
      url.searchParams.set("content-length", String(contentLength));
      return { url: url.toString(), expiresInSeconds };
    },
    async statObject(key) {
      const object = objects.get(key);
      if (!object) return null;
      return { contentLength: object.contentLength };
    },
    async readObject(key) {
      return objects.get(key)?.bytes ?? null;
    },
    put(key, bytes, contentLength = bytes.byteLength) {
      objects.set(key, { bytes, contentLength });
    },
  };
}

async function confirmFile(
  sources: ReturnType<typeof createSources>,
  storage: MemoryStorage,
  userId: string,
  filename: string,
  bytes: Uint8Array,
) {
  const grant = await sources.requestUpload(
    { id: userId },
    { filename, byteLength: bytes.byteLength },
  );
  if (!("confirmation" in grant)) {
    return grant;
  }
  storage.put(objectKey(grant.uploadUrl), bytes);
  return sources.confirmUpload(
    { id: userId },
    { confirmation: grant.confirmation },
  );
}

function objectKey(uploadUrl: string) {
  return decodeURIComponent(new URL(uploadUrl).pathname.slice(1));
}

function file(...parts: Array<string | number[]>) {
  const chunks = parts.map((part) =>
    typeof part === "string" ? new TextEncoder().encode(part) : Uint8Array.from(part),
  );
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function ole(streamName: string) {
  const name = new Uint8Array(streamName.length * 2);
  for (let index = 0; index < streamName.length; index += 1) {
    name[index * 2] = streamName.charCodeAt(index);
  }
  return file([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], [...name]);
}
