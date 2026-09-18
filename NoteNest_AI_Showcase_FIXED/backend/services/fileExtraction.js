import fs from "fs/promises";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { createWorker } from "tesseract.js";
import { pdf as renderPdf } from "pdf-to-img";

const MAX_EXTRACTED_CHARS = 30000;
const MAX_OCR_PDF_PAGES = 6;

function cleanText(text = "") {
  return String(text)
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

async function ocrImages(images) {
  if (!images.length) return "";

  const worker = await createWorker("eng");

  try {
    const pieces = [];

    for (const image of images) {
      const result = await worker.recognize(image);
      const text = cleanText(result?.data?.text || "");

      if (text) {
        pieces.push(text);
      }

      if (pieces.join("\n\n").length >= MAX_EXTRACTED_CHARS) {
        break;
      }
    }

    return cleanText(pieces.join("\n\n"));
  } finally {
    await worker.terminate();
  }
}

async function extractPdf(filePath) {
  const buffer = await fs.readFile(filePath);

  // First try fast text extraction for normal/searchable PDFs.
  try {
    const parsed = await pdfParse(buffer);
    const text = cleanText(parsed?.text || "");

    if (text.length >= 40) {
      return {
        text,
        method: "pdf-text",
      };
    }
  } catch {
    // If normal extraction fails, fall through to OCR.
  }

  // Fallback for scanned/image PDFs: OCR up to the first few pages.
  const document = await renderPdf(filePath, {
    scale: 1.7,
    format: "png",
  });

  const pageImages = [];

  try {
    let count = 0;

    for await (const image of document) {
      pageImages.push(image);
      count += 1;

      if (count >= MAX_OCR_PDF_PAGES) {
        break;
      }
    }

    const text = await ocrImages(pageImages);

    return {
      text,
      method: text ? "pdf-ocr" : "pdf-empty",
    };
  } finally {
    if (typeof document.destroy === "function") {
      await document.destroy();
    }
  }
}

async function extractWord(filePath) {
  const extractor = new WordExtractor();
  const document = await extractor.extract(filePath);

  return {
    text: cleanText(document.getBody()),
    method: "word",
  };
}

async function extractDocxWithFallback(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = cleanText(result?.value || "");

    if (text) {
      return {
        text,
        method: "docx",
      };
    }
  } catch {
    // Fall through to word-extractor.
  }

  return extractWord(filePath);
}

export async function extractTextFromAttachment({
  filePath,
  mimeType = "",
  originalName = "",
}) {
  const extension = path.extname(originalName || filePath).toLowerCase();
  const lowerMime = String(mimeType).toLowerCase();

  try {
    if (
      lowerMime === "text/plain" ||
      lowerMime === "text/markdown" ||
      extension === ".txt" ||
      extension === ".md"
    ) {
      return {
        text: cleanText(await fs.readFile(filePath, "utf8")),
        status: "ready",
        method: "text",
      };
    }

    if (lowerMime === "application/pdf" || extension === ".pdf") {
      const result = await extractPdf(filePath);

      return {
        text: result.text,
        status: result.text ? "ready" : "failed",
        method: result.method,
      };
    }

    if (
      lowerMime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      extension === ".docx"
    ) {
      const result = await extractDocxWithFallback(filePath);

      return {
        text: result.text,
        status: result.text ? "ready" : "failed",
        method: result.method,
      };
    }

    if (
      lowerMime === "application/msword" ||
      extension === ".doc"
    ) {
      const result = await extractWord(filePath);

      return {
        text: result.text,
        status: result.text ? "ready" : "failed",
        method: result.method,
      };
    }

    if (lowerMime.startsWith("image/")) {
      const text = await ocrImages([filePath]);

      return {
        text,
        status: text ? "ready" : "failed",
        method: "image-ocr",
      };
    }

    return {
      text: "",
      status: "unsupported",
      method: "unsupported",
    };
  } catch (error) {
    return {
      text: "",
      status: "failed",
      method: "error",
      error: error.message,
    };
  }
}

export function buildAttachmentPath(filename) {
  return path.resolve("uploads", filename);
}
