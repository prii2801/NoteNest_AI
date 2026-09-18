import express from "express";
import mongoose from "mongoose";
import Note from "../models/Note.js";
import requireAuth from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return [
    ...new Set(
      tags
        .map((tag) => String(tag).trim().toLowerCase())
        .filter(Boolean)
    ),
  ].slice(0, 20);
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .slice(0, 10)
    .map((file) => ({
      originalName: String(file.originalName || "").trim(),
      filename: String(file.filename || "").trim(),
      url: String(file.url || "").trim(),
      mimeType: String(file.mimeType || "").trim(),
      size: Number(file.size || 0),

      extractedText: String(file.extractedText || "").slice(0, 30000),

      extractionStatus: [
        "ready",
        "pending",
        "failed",
        "unsupported",
      ].includes(file.extractionStatus)
        ? file.extractionStatus
        : "pending",

      extractionMethod: String(file.extractionMethod || "").slice(0, 80),
    }))
    .filter(
      (file) =>
        file.originalName &&
        file.filename &&
        file.url &&
        file.mimeType
    );
}

function safeColor(value) {
  const color = String(value || "").trim();

  return /^#[0-9a-fA-F]{6}$/.test(color)
    ? color
    : "#EEF2FF";
}

router.get("/", async (req, res) => {
  try {
    const notes = await Note.find({
      user: req.userId,
    }).sort({
      pinned: -1,
      updatedAt: -1,
    });

    res.json(notes);
  } catch (error) {
    res.status(500).json({
      message: "Could not load notes",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid note id",
      });
    }

    const note = await Note.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!note) {
      return res.status(404).json({
        message: "Note not found",
      });
    }

    res.json(note);
  } catch (error) {
    res.status(500).json({
      message: "Could not read note",
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    const attachments = normalizeAttachments(req.body.attachments);
    const clientRequestId = String(req.body.clientRequestId || "").trim();

    if (!title) {
      return res.status(400).json({
        message: "Title is required",
      });
    }

    if (!content && attachments.length === 0) {
      return res.status(400).json({
        message: "Add note text or at least one attachment",
      });
    }

    if (clientRequestId) {
      const existing = await Note.findOne({
        user: req.userId,
        clientRequestId,
      });

      if (existing) {
        return res.status(200).json(existing);
      }
    }

    const note = await Note.create({
      user: req.userId,
      clientRequestId,

      subject:
        String(req.body.subject || "General").trim() ||
        "General",

      topic: String(req.body.topic || "").trim(),
      title,
      content,
      tags: normalizeTags(req.body.tags),
      attachments,
      color: safeColor(req.body.color),
      pinned: Boolean(req.body.pinned),
      favorite: Boolean(req.body.favorite),
      archived: Boolean(req.body.archived),
    });

    res.status(201).json(note);
  } catch (error) {
    if (error?.code === 11000 && req.body.clientRequestId) {
      const existing = await Note.findOne({
        user: req.userId,
        clientRequestId: String(req.body.clientRequestId),
      });

      if (existing) {
        return res.status(200).json(existing);
      }
    }

    res.status(500).json({
      message: "Could not create note",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid note id",
      });
    }

    const updates = {};
    const textFields = [
      "subject",
      "topic",
      "title",
      "content",
    ];

    const booleanFields = [
      "pinned",
      "favorite",
      "archived",
    ];

    for (const field of textFields) {
      if (req.body[field] !== undefined) {
        updates[field] =
          String(req.body[field]).trim();
      }
    }

    for (const field of booleanFields) {
      if (req.body[field] !== undefined) {
        updates[field] =
          Boolean(req.body[field]);
      }
    }

    if (req.body.tags !== undefined) {
      updates.tags =
        normalizeTags(req.body.tags);
    }

    if (req.body.attachments !== undefined) {
      updates.attachments =
        normalizeAttachments(
          req.body.attachments
        );
    }

    if (req.body.color !== undefined) {
      updates.color =
        safeColor(req.body.color);
    }

    if (updates.title === "") {
      return res.status(400).json({
        message: "Title cannot be empty",
      });
    }

    const current = await Note.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!current) {
      return res.status(404).json({
        message: "Note not found",
      });
    }

    const nextContent =
      updates.content !== undefined
        ? updates.content
        : current.content;

    const nextAttachments =
      updates.attachments !== undefined
        ? updates.attachments
        : current.attachments;

    if (
      !nextContent &&
      (!nextAttachments ||
        nextAttachments.length === 0)
    ) {
      return res.status(400).json({
        message:
          "A note must contain text or an attachment",
      });
    }

    Object.assign(current, updates);
    await current.save();

    res.json(current);
  } catch (error) {
    res.status(500).json({
      message: "Could not update note",
      error: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid note id",
      });
    }

    const note =
      await Note.findOneAndDelete({
        _id: req.params.id,
        user: req.userId,
      });

    if (!note) {
      return res.status(404).json({
        message: "Note not found",
      });
    }

    res.json({
      message: "Note deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Could not delete note",
      error: error.message,
    });
  }
});

export default router;
