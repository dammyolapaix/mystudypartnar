import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { convertWithOptions } from "libreoffice-convert";
import type { ConvertedOfficePdf, OfficeExtension } from "./types";

const convertToPdf = promisify(convertWithOptions);

const slidesWithoutNotes =
  'impress_pdf_Export:{"ExportNotesPages":{"type":"boolean","value":"false"},"ExportOnlyNotesPages":{"type":"boolean","value":"false"}}';

export async function convertOfficeToPdf(
  bytes: Uint8Array,
  extension: OfficeExtension,
): Promise<ConvertedOfficePdf> {
  const pdf = await convertToPdf(Buffer.from(bytes), "pdf", slideFilter(extension), {
    fileName: `source.${extension}`,
  });
  const path = join(tmpdir(), `source-${randomUUID()}.pdf`);
  await writeFile(path, pdf);
  return { pdf, path };
}

function slideFilter(extension: OfficeExtension) {
  if (extension === "ppt" || extension === "pptx") return slidesWithoutNotes;
  return undefined;
}
