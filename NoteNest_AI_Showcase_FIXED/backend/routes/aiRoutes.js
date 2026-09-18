import express from "express";
import mongoose from "mongoose";
import fs from "fs";
import Note from "../models/Note.js";
import requireAuth from "../middleware/auth.js";
import { runStudyAssistant } from "../services/aiService.js";
import {
  buildAttachmentPath,
  extractTextFromAttachment,
} from "../services/fileExtraction.js";

const router = express.Router();
router.use(requireAuth);

const ALLOWED_MODES = new Set([
  "summary",
  "keypoints",
  "simplify",
  "revision",
]);

async function prepareNoteForAI(note, warnings) {
  const parts = [];

  if (note.content?.trim()) {
    parts.push(note.content.trim());
  }

  for (const attachment of note.attachments || []) {
    let text = String(
      attachment.extractedText || ""
    ).trim();

    if (!text) {
      const filePath =
        buildAttachmentPath(
          attachment.filename
        );

      if (fs.existsSync(filePath)) {
        const extraction =
          await extractTextFromAttachment({
            filePath,
            mimeType:
              attachment.mimeType,
            originalName:
              attachment.originalName,
          });

        text = String(
          extraction.text || ""
        ).trim();
      }
    }

    if (text) {
      parts.push(
        [
          `ATTACHMENT: ${attachment.originalName}`,
          text,
        ].join("\n")
      );
    } else {
      warnings.push(
        `Could not extract readable text from ${attachment.originalName}.`
      );
    }
  }

  return {
    subject: note.subject,
    topic: note.topic,
    title: note.title,
    content: parts.join("\n\n"),
  };
}

router.post("/study", async (req, res) => {
  try {
    const {
      noteIds,
      mode = "summary",
    } = req.body;

    if (
      !Array.isArray(noteIds) ||
      noteIds.length === 0
    ) {
      return res.status(400).json({
        message:
          "Select at least one note",
      });
    }

    if (noteIds.length > 20) {
      return res.status(400).json({
        message:
          "Select at most 20 notes at a time",
      });
    }

    if (!ALLOWED_MODES.has(mode)) {
      return res.status(400).json({
        message: "Invalid AI action",
      });
    }

    const validIds =
      noteIds.filter((id) =>
        mongoose.isValidObjectId(id)
      );

    if (
      validIds.length !==
      noteIds.length
    ) {
      return res.status(400).json({
        message:
          "One or more note ids are invalid",
      });
    }

    const notes = await Note.find({
      _id: { $in: validIds },
      user: req.userId,
    }).select(
      "subject topic title content attachments"
    );

    if (
      notes.length !==
      validIds.length
    ) {
      return res.status(404).json({
        message:
          "One or more selected notes were not found",
      });
    }

    const warnings = [];

    const preparedNotes =
      await Promise.all(
        notes.map((note) =>
          prepareNoteForAI(
            note,
            warnings
          )
        )
      );

    const usableNotes =
      preparedNotes.filter(
        (note) =>
          note.content.trim().length > 0
      );

    if (usableNotes.length === 0) {
      return res.status(400).json({
        message:
          "No readable text could be found in the selected notes or attachments.",
        warnings,
      });
    }

    const totalCharacters =
      usableNotes.reduce(
        (sum, note) =>
          sum + note.content.length,
        0
      );

    if (totalCharacters > 90000) {
      return res.status(400).json({
        message:
          "Selected material is too long. Choose fewer notes or smaller files.",
      });
    }

    const result =
      await runStudyAssistant(
        usableNotes,
        mode
      );

    res.json({
      mode,
      noteCount: notes.length,
      warnings,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      message:
        "Study assistant could not complete the request",
      error: error.message,
    });
  }
});

export default router;
