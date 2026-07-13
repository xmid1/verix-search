import { PDFParse } from "pdf-parse";
import { childLogger } from "../../infra/logger.js";

const log = childLogger({ module: "extraction" });

export async function extractPdfText(
  buffer: Buffer
): Promise<{ text: string; numPages: number }> {
  let parser: PDFParse;
  try {
    parser = new PDFParse({ data: buffer });
  } catch (err) {
    throw new Error(`extractPdfText: failed to initialize PDF parser: ${String(err)}`);
  }

  let result: Awaited<ReturnType<PDFParse["getText"]>>;
  try {
    result = await parser.getText();
  } catch (err) {
    throw new Error(`extractPdfText: failed to extract text from PDF: ${String(err)}`);
  } finally {
    await parser.destroy().catch(() => undefined);
  }

  const text = result.text ?? "";
  const numPages = result.total;

  log.debug({ numPages, chars: text.length }, "extractPdfText complete");

  return { text, numPages };
}
