import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, default: 0 },

    extractedText: {
      type: String,
      default: "",
      maxlength: 30000,
    },

    extractionStatus: {
      type: String,
      enum: ["ready", "pending", "failed", "unsupported"],
      default: "pending",
    },

    extractionMethod: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const noteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    clientRequestId: {
      type: String,
      default: "",
      trim: true,
    },

    subject: {
      type: String,
      trim: true,
      default: "General",
      maxlength: 80,
    },

    topic: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30000,
    },

    tags: {
      type: [String],
      default: [],
    },

    attachments: {
      type: [attachmentSchema],
      default: [],
    },

    color: {
      type: String,
      default: "#EEF2FF",
    },

    pinned: {
      type: Boolean,
      default: false,
    },

    archived: {
      type: Boolean,
      default: false,
    },

    favorite: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

noteSchema.index({ user: 1, updatedAt: -1 });

noteSchema.index(
  { user: 1, clientRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientRequestId: { $type: "string", $gt: "" },
    },
  }
);

const Note = mongoose.model("Note", noteSchema);

export default Note;
