import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import longPage from "./long-page.json";
import { createSources, listPassages, listSources, type SourceStorage } from "./sources";
import type { PreparationEvent, RunChannel } from "./types";
import { createUser, failSourceKeepingPassages, removeUser } from "./test-users";

vi.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  updateTag: () => {},
}));

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const FIFTEEN_MINUTES = 15 * 60;
const fixtureUsers: string[] = [];
const temporaryPdfs: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPdfs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
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
      failureReason: "",
      runId: null,
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

test("an object that never became a source is deleted after the upload url expires", async () => {
  const student = { id: crypto.randomUUID() };
  const storage = memoryStorage();
  let now = 1_700_000_000_000;
  const scheduled: Array<{ objectKey: string; expiresAt: number }> = [];
  const sources = createSources({
    storage,
    secret: "test-secret",
    now: () => now,
    scheduleAbandonedUpload: async (upload) => {
      scheduled.push(upload);
    },
  });
  const pdf = file("%PDF-1.4\n");

  const grant = await sources.requestUpload(
    { id: student.id },
    { filename: "lecture.pdf", byteLength: pdf.byteLength },
  );
  if (!("uploadUrl" in grant)) throw new Error("Expected an upload url");

  const key = objectKey(grant.uploadUrl);
  storage.put(key, pdf);

  expect(scheduled).toEqual([
    { objectKey: key, expiresAt: now + FIFTEEN_MINUTES * 1000 },
  ]);
  expect(await listSources(student.id)).toEqual([]);

  const [upload] = scheduled;
  if (!upload) throw new Error("Expected a scheduled cleanup");
  await sources.removeAbandonedUpload(upload);
  expect(await storage.readObject(key)).toEqual(pdf);

  now = upload.expiresAt;
  await sources.removeAbandonedUpload(upload);
  expect(await storage.readObject(key)).toBeNull();
  expect(await listSources(student.id)).toEqual([]);
});

test("an object that belongs to a source is kept", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  let now = 1_700_000_000_000;
  const sources = createSources({
    storage,
    secret: "test-secret",
    now: () => now,
    scheduleAbandonedUpload: async () => {},
  });
  const pdf = file("%PDF-1.4\nlecture");

  const grant = await sources.requestUpload(
    { id: student.id },
    { filename: "lecture.pdf", byteLength: pdf.byteLength },
  );
  if (!("confirmation" in grant) || !("uploadUrl" in grant)) {
    throw new Error("Expected an upload url");
  }
  const key = objectKey(grant.uploadUrl);
  storage.put(key, pdf);
  const uploaded = await sources.confirmUpload(
    { id: student.id },
    { confirmation: grant.confirmation },
  );
  if (!("source" in uploaded)) throw new Error("Expected a source");

  now += FIFTEEN_MINUTES * 1000;
  await sources.removeAbandonedUpload({
    objectKey: key,
    expiresAt: now,
  });

  expect(await storage.readObject(key)).toEqual(pdf);
  expect(await listSources(student.id)).toEqual([uploaded.source]);
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

test("a text pdf becomes ready with the page text as one passage", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const pdf = file("%PDF-1.4\nlecture");
  const pageText = "Lecture 1\nThe heart has four chambers.\nPage 1";
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async () => [{ page: 1, text: pageText }],
    embedPassages: async () => [embedding(0.25)],
  });

  const uploaded = await confirmFile(sources, storage, student.id, "lecture.pdf", pdf);
  if (!("source" in uploaded)) {
    throw new Error("Expected a source");
  }

  await sources.prepare(uploaded.source.id);

  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "lecture.pdf",
      status: "ready",
      failureReason: "",
      runId: null,
      userId: student.id,
    },
  ]);
  const passages = await listPassages(student.id, uploaded.source.id);
  expect(passages).toEqual([
    {
      page: 1,
      order: 1,
      text: pageText,
      embedding: embedding(0.25),
    },
  ]);
  expect(await listPassages(crypto.randomUUID(), uploaded.source.id)).toEqual([]);
});

test("a word or powerpoint file becomes ready and the temporary pdf is discarded", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const files = [
    {
      filename: "lecture.pptx",
      extension: "pptx",
      bytes: file([0x50, 0x4b, 0x03, 0x04], "ppt/slides/slide1.xml"),
      page: 3,
      text: "The heart has four chambers.",
      vector: 0.25,
    },
    {
      filename: "lecture.docx",
      extension: "docx",
      bytes: file([0x50, 0x4b, 0x03, 0x04], "word/document.xml"),
      page: 2,
      text: "Lecture 2\nArteries carry blood away from the heart.",
      vector: 0.5,
    },
    {
      filename: "essay.doc",
      extension: "doc",
      bytes: ole("WordDocument"),
      page: 1,
      text: "An older Word page.",
      vector: 0.75,
    },
    {
      filename: "deck.ppt",
      extension: "ppt",
      bytes: ole("PowerPoint Document"),
      page: 4,
      text: "Slide one.",
      vector: 0.1,
    },
  ] as const;

  for (const office of files) {
    const convertedPdf = file(`%PDF-1.4\n${office.extension}`);
    let temporaryPdf = "";
    let keptUntilPassagesStored = false;
    const sources = createSources({
      storage,
      secret: "test-secret",
      convertOffice: async (bytes, extension) => {
        if (extension !== office.extension || !sameBytes(bytes, office.bytes)) {
          throw new Error(`expected the original ${office.extension} file`);
        }
        temporaryPdf = await writeTemporaryPdf(convertedPdf);
        return { pdf: convertedPdf, path: temporaryPdf };
      },
      extractPdf: async (bytes) => {
        if (!sameBytes(bytes, convertedPdf)) {
          throw new Error("expected the converted pdf");
        }
        return [{ page: office.page, text: office.text }];
      },
      embedPassages: async () => {
        keptUntilPassagesStored = existsSync(temporaryPdf);
        return [embedding(office.vector)];
      },
    });

    const uploaded = await confirmFile(
      sources,
      storage,
      student.id,
      office.filename,
      office.bytes,
    );
    if (!("source" in uploaded)) {
      throw new Error(`Expected ${office.filename} to become a source`);
    }

    await sources.prepare(uploaded.source.id);

    expect(keptUntilPassagesStored).toBe(true);
    expect(existsSync(temporaryPdf)).toBe(false);
    expect(await listPassages(student.id, uploaded.source.id)).toEqual([
      {
        page: office.page,
        order: 1,
        text: office.text,
        embedding: embedding(office.vector),
      },
    ]);
    expect(
      await storage.readObject(`sources/${student.id}/${uploaded.source.id}`),
    ).toEqual(office.bytes);
    const listed = await listSources(student.id);
    expect(listed.find((source) => source.id === uploaded.source.id)).toMatchObject({
      filename: office.filename,
      status: "ready",
      failureReason: "",
    });
    for (const key of storage.keys()) {
      const stored = await storage.readObject(key);
      expect(stored !== null && sameBytes(stored, convertedPdf)).toBe(false);
    }
  }
});

test("a deck whose only words are in the notes becomes failed", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const notes = "Hidden speaker notes.";
  const deck = file(
    [0x50, 0x4b, 0x03, 0x04],
    "ppt/notesSlides/notesSlide1.xml",
    notes,
  );
  const convertedPdf = file("%PDF-1.4\nslides");
  let temporaryPdf = "";
  const sources = createSources({
    storage,
    secret: "test-secret",
    convertOffice: async () => {
      temporaryPdf = await writeTemporaryPdf(convertedPdf);
      return { pdf: convertedPdf, path: temporaryPdf };
    },
    extractPdf: async (bytes) => {
      if (!sameBytes(bytes, convertedPdf) || includesText(bytes, notes)) {
        throw new Error("expected a pdf without speaker notes");
      }
      return [{ page: 1, text: "" }];
    },
    embedPassages: async () => {
      throw new Error("embeddings should not run");
    },
  });

  const uploaded = await confirmFile(sources, storage, student.id, "notes.pptx", deck);
  if (!("source" in uploaded)) throw new Error("Expected a source");

  await sources.prepare(uploaded.source.id);

  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "notes.pptx",
      status: "failed",
      failureReason: "no_text",
      runId: null,
      userId: student.id,
    },
  ]);
  expect(includesText(deck, notes)).toBe(true);
  expect(await listPassages(student.id, uploaded.source.id)).toEqual([]);
  expect(existsSync(temporaryPdf)).toBe(false);
  expect(
    await storage.readObject(`sources/${student.id}/${uploaded.source.id}`),
  ).toEqual(deck);
});

test("an office file that cannot be converted becomes failed", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const lecture = ole("WordDocument");
  const sources = createSources({
    storage,
    secret: "test-secret",
    convertOffice: async () => {
      throw new Error("soffice failed");
    },
    extractPdf: async () => {
      throw new Error("extractor should not run");
    },
    embedPassages: async () => {
      throw new Error("embeddings should not run");
    },
  });

  const uploaded = await confirmFile(
    sources,
    storage,
    student.id,
    "locked.doc",
    lecture,
  );
  if (!("source" in uploaded)) throw new Error("Expected a source");

  await sources.prepare(uploaded.source.id);

  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "locked.doc",
      status: "failed",
      failureReason: "could_not_open",
      runId: null,
      userId: student.id,
    },
  ]);
  expect(await listPassages(student.id, uploaded.source.id)).toEqual([]);
  expect(
    await storage.readObject(`sources/${student.id}/${uploaded.source.id}`),
  ).toEqual(lecture);
});

test("a long page stays on that page and splits into overlapping windows", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async () => [{ page: 2, text: longPage.text }],
    embedPassages: async (texts) => texts.map((_, index) => embedding(index === 0 ? 0.25 : 0.5)),
  });

  const uploaded = await confirmFile(
    sources,
    storage,
    student.id,
    "lecture.pdf",
    file("%PDF-1.4\nlecture"),
  );
  if (!("source" in uploaded)) throw new Error("Expected a source");

  await sources.prepare(uploaded.source.id);

  expect(await listPassages(student.id, uploaded.source.id)).toEqual([
    { page: 2, order: 1, text: longPage.windows[0], embedding: embedding(0.25) },
    { page: 2, order: 2, text: longPage.windows[1], embedding: embedding(0.5) },
  ]);
});

test("a mixed pdf becomes ready and image pages add no passages", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const firstPage = "Lecture 4\nArteries carry blood away from the heart.\nFooter";
  const lastPage = "Veins return blood.";
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async () => [
      { page: 1, text: firstPage },
      { page: 2, text: "" },
      { page: 3, text: "   \n" },
      { page: 4, text: lastPage },
    ],
    embedPassages: async (texts) => texts.map((_, index) => embedding(index === 0 ? 0.25 : 0.5)),
  });

  const uploaded = await confirmFile(
    sources,
    storage,
    student.id,
    "mixed.pdf",
    file("%PDF-1.4\nmixed"),
  );
  if (!("source" in uploaded)) throw new Error("Expected a source");

  await sources.prepare(uploaded.source.id);

  const passages = await listPassages(student.id, uploaded.source.id);
  expect(passages.map((passage) => passage.text)).toEqual([firstPage, lastPage]);
  expect(passages.map((passage) => [passage.page, passage.order])).toEqual([
    [1, 1],
    [4, 1],
  ]);
  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "mixed.pdf",
      status: "ready",
      failureReason: "",
      runId: null,
      userId: student.id,
    },
  ]);
});

test("a pdf with no text becomes failed", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async () => [
      { page: 1, text: "" },
      { page: 2, text: "   \n" },
    ],
    embedPassages: async () => {
      throw new Error("embeddings should not run");
    },
  });
  const pdf = file("%PDF-1.4\nscan");

  const uploaded = await confirmFile(sources, storage, student.id, "scan.pdf", pdf);
  if (!("source" in uploaded)) throw new Error("Expected a source");

  await sources.prepare(uploaded.source.id);

  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "scan.pdf",
      status: "failed",
      failureReason: "no_text",
      runId: null,
      userId: student.id,
    },
  ]);
  expect(await listPassages(student.id, uploaded.source.id)).toEqual([]);
  expect(await storage.readObject(`sources/${student.id}/${uploaded.source.id}`)).toEqual(
    pdf,
  );
});

test("a pdf that cannot be opened becomes failed", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async (bytes) => {
      const header = new TextDecoder().decode(bytes.slice(0, 12));
      if (header.startsWith("%PDF-locked")) {
        throw new Error("password required");
      }
      throw new Error("invalid pdf");
    },
    embedPassages: async () => {
      throw new Error("embeddings should not run");
    },
  });

  const corrupt = await confirmFile(
    sources,
    storage,
    student.id,
    "corrupt.pdf",
    file("%PDF-1.4\nbroken"),
  );
  const locked = await confirmFile(
    sources,
    storage,
    student.id,
    "locked.pdf",
    file("%PDF-locked"),
  );
  const missing = await confirmFile(
    sources,
    storage,
    student.id,
    "missing.pdf",
    file("%PDF-1.4\ngone"),
  );
  if (!("source" in corrupt) || !("source" in locked) || !("source" in missing)) {
    throw new Error("Expected a source");
  }
  storage.remove(`sources/${student.id}/${missing.source.id}`);

  await sources.prepare(corrupt.source.id);
  await sources.prepare(locked.source.id);
  await sources.prepare(missing.source.id);

  const listed = await listSources(student.id);
  expect(listed.map((source) => [source.filename, source.status, source.failureReason])).toEqual([
    ["missing.pdf", "failed", "could_not_open"],
    ["locked.pdf", "failed", "could_not_open"],
    ["corrupt.pdf", "failed", "could_not_open"],
  ]);
  expect(await listPassages(student.id, corrupt.source.id)).toEqual([]);
  expect(await listPassages(student.id, locked.source.id)).toEqual([]);
});

test("embeddings that still fail become failed", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async () => [{ page: 1, text: "The heart has four chambers." }],
    embedPassages: async () => {
      throw new Error("embedding service unavailable");
    },
  });
  const pdf = file("%PDF-1.4\nlecture");
  const uploaded = await confirmFile(sources, storage, student.id, "lecture.pdf", pdf);
  if (!("source" in uploaded)) throw new Error("Expected a source");

  await expect(sources.prepare(uploaded.source.id)).rejects.toThrow(
    "embedding service unavailable",
  );
  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "lecture.pdf",
      status: "preparing",
      failureReason: "",
      runId: null,
      userId: student.id,
    },
  ]);

  await sources.recordEmbeddingFailure(uploaded.source.id);

  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "lecture.pdf",
      status: "failed",
      failureReason: "embedding_failed",
      runId: null,
      userId: student.id,
    },
  ]);
  expect(await listPassages(student.id, uploaded.source.id)).toEqual([]);
  expect(await storage.readObject(`sources/${student.id}/${uploaded.source.id}`)).toEqual(
    pdf,
  );
});

test("a retry keeps the original file and replaces passages", async () => {
  const student = await createUser();
  const other = await createUser();
  fixtureUsers.push(student.id, other.id);
  const storage = memoryStorage();
  const runs: string[] = [];
  let text = "Stale passage.";
  const sources = createSources({
    storage,
    secret: "test-secret",
    startPreparation: async (id) => {
      const runId = `run-${runs.length + 1}`;
      runs.push(runId);
      if (runs.length > 1) {
        await sources.recordEmbeddingFailure(id, "run-1");
      }
      return runId;
    },
    extractPdf: async () => [{ page: 1, text }],
    embedPassages: async (texts) =>
      texts.map(() => embedding(texts[0] === "Stale passage." ? 0.1 : 0.25)),
  });
  const pdf = file("%PDF-1.4\nlecture");
  const uploaded = await confirmFile(sources, storage, student.id, "lecture.pdf", pdf);
  if (!("source" in uploaded)) throw new Error("Expected a source");
  const sourceId = uploaded.source.id;

  await sources.prepare(sourceId);
  await failSourceKeepingPassages(sourceId);
  expect(await listPassages(student.id, sourceId)).toEqual([
    {
      page: 1,
      order: 1,
      text: "Stale passage.",
      embedding: embedding(0.1),
    },
  ]);

  expect(await sources.retry(null, sourceId)).toEqual({
    error: "Not authenticated",
  });
  expect(await sources.retry({ id: other.id }, sourceId)).toEqual({
    error: "This source was not found",
  });
  expect(await sources.retry({ id: student.id }, sourceId)).toEqual({
    source: {
      id: sourceId,
      filename: "lecture.pdf",
      status: "preparing",
      failureReason: "",
      runId: "run-2",
      userId: student.id,
    },
  });
  expect(await listPassages(student.id, sourceId)).toEqual([]);
  expect(await storage.readObject(`sources/${student.id}/${sourceId}`)).toEqual(pdf);
  await sources.recordEmbeddingFailure(sourceId, "run-1");
  expect((await listSources(student.id))[0]?.status).toBe("preparing");

  text = "Fresh passage.";
  await sources.prepare(sourceId);

  expect(await listPassages(student.id, sourceId)).toEqual([
    {
      page: 1,
      order: 1,
      text: "Fresh passage.",
      embedding: embedding(0.25),
    },
  ]);
  expect(await listSources(student.id)).toEqual([
    {
      id: sourceId,
      filename: "lecture.pdf",
      status: "ready",
      failureReason: "",
      runId: "run-2",
      userId: student.id,
    },
  ]);
});

test("a ready source cannot be retried or prepared again", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  let extracts = 0;
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async () => {
      extracts += 1;
      return [{ page: 1, text: extracts === 1 ? "First reading." : "Replacement reading." }];
    },
    embedPassages: async () => [embedding(extracts === 1 ? 0.25 : 0.75)],
  });

  const uploaded = await confirmFile(
    sources,
    storage,
    student.id,
    "lecture.pdf",
    file("%PDF-1.4\nlecture"),
  );
  if (!("source" in uploaded)) throw new Error("Expected a source");

  await sources.prepare(uploaded.source.id);
  expect(await sources.retry({ id: student.id }, uploaded.source.id)).toEqual({
    error: "A ready source cannot be retried",
  });
  await sources.prepare(uploaded.source.id);

  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "lecture.pdf",
      status: "ready",
      failureReason: "",
      runId: null,
      userId: student.id,
    },
  ]);
  expect(await listPassages(student.id, uploaded.source.id)).toEqual([
    { page: 1, order: 1, text: "First reading.", embedding: embedding(0.25) },
  ]);
});

test("a passage write is discarded when the source is no longer preparing", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  const gates: Array<() => void> = [];
  let waiting = 0;
  let bothWaiting: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    bothWaiting = resolve;
  });
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async () => [{ page: 1, text: "One reading." }],
    embedPassages: async () => {
      waiting += 1;
      const vector = embedding(waiting === 1 ? 0.25 : 0.75);
      if (waiting === 2) bothWaiting();
      await new Promise<void>((resolve) => {
        gates.push(resolve);
      });
      return [vector];
    },
  });

  const uploaded = await confirmFile(
    sources,
    storage,
    student.id,
    "lecture.pdf",
    file("%PDF-1.4\nlecture"),
  );
  if (!("source" in uploaded)) throw new Error("Expected a source");

  const first = sources.prepare(uploaded.source.id);
  const second = sources.prepare(uploaded.source.id);
  await opened;
  gates[0]?.();
  await vi.waitFor(async () => {
    expect(await listPassages(student.id, uploaded.source.id)).toHaveLength(1);
  });
  const kept = await listPassages(student.id, uploaded.source.id);
  gates[1]?.();
  await Promise.all([first, second]);

  expect(await listPassages(student.id, uploaded.source.id)).toEqual(kept);
  expect(kept).toEqual([
    {
      page: 1,
      order: 1,
      text: "One reading.",
      embedding: embedding(0.25),
    },
  ]);
});

test("a passage write is discarded when the source was deleted", async () => {
  const student = await createUser();
  fixtureUsers.push(student.id);
  const storage = memoryStorage();
  let release: () => void = () => {};
  let embedded: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    embedded = resolve;
  });
  const sources = createSources({
    storage,
    secret: "test-secret",
    extractPdf: async () => [{ page: 1, text: "Gone before it is stored." }],
    embedPassages: async () => {
      embedded();
      await gate;
      return [embedding(0.25)];
    },
  });

  const uploaded = await confirmFile(
    sources,
    storage,
    student.id,
    "lecture.pdf",
    file("%PDF-1.4\nlecture"),
  );
  if (!("source" in uploaded)) throw new Error("Expected a source");

  const pending = sources.prepare(uploaded.source.id);
  await started;
  expect(await sources.deleteSource({ id: student.id }, uploaded.source.id)).toEqual({
    deleted: true,
  });
  release();
  await pending;

  expect(await listSources(student.id)).toEqual([]);
  expect(await listPassages(student.id, uploaded.source.id)).toEqual([]);
});

test("only the student who owns a source can subscribe to its run", async () => {
  const student = await createUser();
  const other = await createUser();
  fixtureUsers.push(student.id, other.id);
  const storage = memoryStorage();
  const sources = createSources({
    storage,
    secret: "test-secret",
    startPreparation: async () => "run-1",
  });
  const pdf = file("%PDF-1.4\nlecture");
  const uploaded = await confirmFile(sources, storage, student.id, "lecture.pdf", pdf);
  if (!("source" in uploaded)) throw new Error("Expected a source");

  expect(await sources.subscribe(null, "run-1")).toEqual({
    error: "Not authenticated",
  });
  expect(await sources.subscribe({ id: other.id }, "run-1")).toEqual({
    error: "This source was not found",
  });
  expect(await sources.subscribe({ id: other.id }, "run-2")).toEqual({
    error: "This source was not found",
  });
  expect(await sources.subscribe({ id: student.id }, "run-1")).toEqual({
    channel: "run-1",
  });
  expect(await listSources(other.id)).toEqual([]);
  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "lecture.pdf",
      status: "preparing",
      failureReason: "",
      runId: "run-1",
      userId: student.id,
    },
  ]);
});

test("a student can subscribe to each preparing run", async () => {
  const student = await createUser();
  const other = await createUser();
  fixtureUsers.push(student.id, other.id);
  const storage = memoryStorage();
  const runIds = ["run-1", "run-2"];
  const sources = createSources({
    storage,
    secret: "test-secret",
    startPreparation: async () => runIds.shift() ?? null,
  });

  const first = await confirmFile(
    sources,
    storage,
    student.id,
    "lecture.pdf",
    file("%PDF-1.4\nlecture"),
  );
  const second = await confirmFile(
    sources,
    storage,
    student.id,
    "slides.pdf",
    file("%PDF-1.4\nslides"),
  );
  if (!("source" in first) || !("source" in second)) {
    throw new Error("Expected two sources");
  }

  expect(await sources.subscribe({ id: student.id }, "run-1")).toEqual({
    channel: "run-1",
  });
  expect(await sources.subscribe({ id: student.id }, "run-2")).toEqual({
    channel: "run-2",
  });
  expect(await sources.subscribe({ id: other.id }, "run-1")).toEqual({
    error: "This source was not found",
  });
  expect(await sources.subscribe({ id: other.id }, "run-2")).toEqual({
    error: "This source was not found",
  });
  expect((await listSources(student.id)).map((source) => source.status)).toEqual([
    "preparing",
    "preparing",
  ]);
});

test("the owner can replay events from earlier in that run", async () => {
  const student = await createUser();
  const other = await createUser();
  fixtureUsers.push(student.id, other.id);
  const storage = memoryStorage();
  const sources = createSources({
    storage,
    secret: "test-secret",
    startPreparation: async () => "run-1",
    extractPdf: async () => [{ page: 1, text: "The heart has four chambers." }],
    embedPassages: async (texts) => texts.map(() => embedding(0.25)),
    runs: memoryRuns(),
  });
  const uploaded = await confirmFile(
    sources,
    storage,
    student.id,
    "lecture.pdf",
    file("%PDF-1.4\nlecture"),
  );
  if (!("source" in uploaded)) throw new Error("Expected a source");

  await sources.prepare(uploaded.source.id);
  await sources.finishRun(uploaded.source.id);

  expect(await sources.replay({ id: student.id }, "run-1")).toEqual({
    events: [
      { type: "step", name: "extracting text" },
      { type: "step", name: "splitting passages" },
      { type: "step", name: "embedding" },
      { type: "finished" },
    ],
  });
  expect(await sources.replay({ id: other.id }, "run-1")).toEqual({
    error: "This source was not found",
  });
  expect(await sources.replay(null, "run-1")).toEqual({
    error: "Not authenticated",
  });
  expect(await listSources(student.id)).toEqual([
    {
      id: uploaded.source.id,
      filename: "lecture.pdf",
      status: "ready",
      failureReason: "",
      runId: "run-1",
      userId: student.id,
    },
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

function memoryRuns(): RunChannel {
  const events = new Map<string, PreparationEvent[]>();

  return {
    async emit(runId, event) {
      const stored = events.get(runId) ?? [];
      stored.push(event);
      events.set(runId, stored);
    },
    async history(runId) {
      return events.get(runId) ?? [];
    },
  };
}

type MemoryStorage = SourceStorage & {
  put: (key: string, bytes: Uint8Array, contentLength?: number) => void;
  remove: (key: string) => void;
  keys: () => string[];
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
    async deleteObject(key) {
      objects.delete(key);
    },
    put(key, bytes, contentLength = bytes.byteLength) {
      objects.set(key, { bytes, contentLength });
    },
    remove(key) {
      objects.delete(key);
    },
    keys() {
      return [...objects.keys()];
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

function embedding(first: number) {
  return Array.from({ length: 1536 }, (_, index) => (index === 0 ? first : 0));
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

function includesText(bytes: Uint8Array, text: string) {
  return new TextDecoder().decode(bytes).includes(text);
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((value, index) => value === right[index]);
}

async function writeTemporaryPdf(bytes: Uint8Array) {
  const directory = await mkdtemp(join(tmpdir(), "source-pdf-"));
  temporaryPdfs.push(directory);
  const path = join(directory, "converted.pdf");
  await writeFile(path, bytes);
  return path;
}

function ole(streamName: string) {
  const name = new Uint8Array(streamName.length * 2);
  for (let index = 0; index < streamName.length; index += 1) {
    name[index * 2] = streamName.charCodeAt(index);
  }
  return file([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], [...name]);
}
