export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
export const UPLOAD_URL_SECONDS = 15 * 60;

const EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx"] as const;

export type SourceExtension = (typeof EXTENSIONS)[number];

const OLE_HEADER = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04];
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46];

export function sourceExtension(filename: string): SourceExtension | null {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;

  const extension = base.slice(dot + 1).toLowerCase();
  if (!EXTENSIONS.includes(extension as SourceExtension)) return null;
  return extension as SourceExtension;
}

export function sourceObjectKey(studentId: string, sourceId: string) {
  return `sources/${studentId}/${sourceId}`;
}

export function sourceBytesMatch(extension: SourceExtension, bytes: Uint8Array) {
  if (extension === "pdf") return startsWith(bytes, PDF_HEADER);
  if (extension === "docx") {
    return startsWith(bytes, ZIP_HEADER) && includesAscii(bytes, "word/");
  }
  if (extension === "pptx") {
    return startsWith(bytes, ZIP_HEADER) && includesAscii(bytes, "ppt/");
  }
  if (extension === "doc") {
    return startsWith(bytes, OLE_HEADER) && includesUtf16Le(bytes, "WordDocument");
  }
  if (extension === "ppt") {
    return (
      startsWith(bytes, OLE_HEADER) &&
      includesUtf16Le(bytes, "PowerPoint Document")
    );
  }
  return false;
}

function startsWith(bytes: Uint8Array, prefix: number[]) {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function includesAscii(bytes: Uint8Array, text: string) {
  return indexOfBytes(bytes, new TextEncoder().encode(text)) !== -1;
}

function includesUtf16Le(bytes: Uint8Array, text: string) {
  const pattern = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    pattern[index * 2] = code & 0xff;
    pattern[index * 2 + 1] = code >> 8;
  }
  return indexOfBytes(bytes, pattern) !== -1;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array) {
  if (needle.length === 0 || needle.length > haystack.length) return -1;

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return start;
  }

  return -1;
}
