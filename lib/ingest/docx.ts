import mammoth from "mammoth";

/** Text-only extraction (no bounding boxes; the UI highlights by char offsets). */
export async function extractDocx(data: Uint8Array): Promise<{ text: string }> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
  return { text: value.replace(/\r\n/g, "\n") };
}
