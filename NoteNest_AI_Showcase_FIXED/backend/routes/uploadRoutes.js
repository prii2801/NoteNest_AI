import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import requireAuth from "../middleware/auth.js";
import { extractTextFromAttachment } from "../services/fileExtraction.js";

const router = express.Router();
router.use(requireAuth);

const uploadDirectory = path.resolve("uploads");

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDirectory),

  filename: (req, file, cb) => {
    const safeName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    cb(
      null,
      `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`
    );
  },
});

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage,

  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 5,
  },

  fileFilter: (req, file, cb) => {
    if (allowedTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Supported files: JPG, PNG, WEBP, GIF, TXT, MD, PDF, DOC and DOCX"
        )
      );
    }
  },
});

router.post("/", (req, res) => {
  upload.array("files", 5)(req, res, async (error) => {
    if (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    try {
      const files = await Promise.all(
        (req.files || []).map(async (file) => {
          const extraction = await extractTextFromAttachment({
            filePath: file.path,
            mimeType: file.mimetype,
            originalName: file.originalname,
          });

          return {
            originalName: file.originalname,
            filename: file.filename,
            url: `/uploads/${file.filename}`,
            mimeType: file.mimetype,
            size: file.size,

            extractedText: extraction.text || "",
            extractionStatus: extraction.status || "failed",
            extractionMethod: extraction.method || "",
          };
        })
      );

      res.status(201).json({
        files,
      });
    } catch (extractionError) {
      res.status(500).json({
        message: "Files were uploaded but text extraction failed",
        error: extractionError.message,
      });
    }
  });
});

export default router;
