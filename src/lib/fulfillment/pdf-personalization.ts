import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface PdfBuyerWatermark {
  buyerName: string;
  registeredEmail: string;
  orderReference: string;
  purchaseDate: Date;
}

export class UnsupportedWatermarkCharactersError extends Error {
  readonly code = "WATERMARK_FONT_UNSUPPORTED";

  constructor() {
    super("Buyer name contains characters unsupported by the bundled PDF watermark font.");
    this.name = "UnsupportedWatermarkCharactersError";
  }
}

const PERSONAL_USE_NOTICE = "Personal use only. Copying, sharing, resale, or redistribution is not permitted.";
const COPYRIGHT_NOTICE = "© Money Tree Venture. Buyer-specific copy.";

function printableText(value: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
  // Standard Helvetica is WinAnsi-only. Never silently replace a customer's name with question marks.
  if (/[^\x20-\x7e]/.test(normalized)) throw new UnsupportedWatermarkCharactersError();
  return normalized;
}

function wrapLine(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw a restrained, repeatable footer watermark without changing the master bytes. */
export async function personalizePdf(masterBytes: Uint8Array, buyer: PdfBuyerWatermark): Promise<Uint8Array> {
  if (masterBytes.byteLength > 20 * 1024 * 1024) throw new Error("PDF exceeds the 20 MiB processing limit.");
  const document = await PDFDocument.load(masterBytes, { updateMetadata: false });
  if (document.getPageCount() < 1 || document.getPageCount() > 200) throw new Error("PDF must contain between 1 and 200 pages.");
  const font = await document.embedFont(StandardFonts.Helvetica);
  const date = buyer.purchaseDate.toISOString().slice(0, 10);
  const content = [
    `Licensed to: ${printableText(buyer.buyerName)}`,
    `Order: ${printableText(buyer.orderReference)} · Purchase date: ${date}`,
    PERSONAL_USE_NOTICE,
    COPYRIGHT_NOTICE,
  ];

  for (const page of document.getPages()) {
    const { width } = page.getSize();
    const size = 6.5;
    const lines = content.flatMap((line) => wrapLine(line, font, size, Math.max(120, width - 64)));
    let y = 14 + (lines.length - 1) * 8;
    for (const line of lines) {
      page.drawText(line, {
        x: 32,
        y,
        size,
        font,
        color: rgb(0.38, 0.43, 0.51),
        opacity: 0.48,
      });
      y -= 8;
    }
  }
  return document.save({ useObjectStreams: true });
}

export const PDF_WATERMARK_VERSION = 2;
export const PDF_PERSONAL_USE_NOTICE = PERSONAL_USE_NOTICE;
export const PDF_COPYRIGHT_NOTICE = COPYRIGHT_NOTICE;
