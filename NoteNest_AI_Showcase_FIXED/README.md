# NoteNest AI — Showcase Edition

A MERN-stack student notes and revision assistant with complete CRUD, file/image attachments and AI study tools.

## What is included

### CRUD
- Create notes with text, images or documents
- Read a complete note in a dedicated modal
- Update text, subject, topic, tags, colour and attachments
- Delete notes

### Notes features
- Subject, topic and tags
- Search
- Filter by subject
- Sort by recently updated, oldest or A–Z
- Pin, favorite and archive
- 8 clean pastel note colours
- Image thumbnails
- Full attachment viewer / document links
- Dark mode
- Responsive frontend

### Uploads
Supported:
- JPG / PNG / WEBP / GIF
- TXT / Markdown
- PDF
- DOC / DOCX

Maximum 5 files per upload and 8 MB per file.

TXT and Markdown text is also inserted into the note body automatically, so the AI assistant can work with that text.

### AI study assistant
- Summarize
- Key points
- Simplify
- Revision sheet
- Select one or multiple notes
- Save AI output as a new note

If `OPENAI_API_KEY` is empty, the project uses a local demo summarizer. Images, PDFs and Word documents are stored and viewable, but their internal content is not automatically extracted for AI in this version.

## Setup

### Backend

1. Open `backend`
2. Copy `.env.example` to `.env`
3. Add your MongoDB Atlas URI
4. Run:

```powershell
npm.cmd install
npm.cmd run dev
```

Expected:

```text
MongoDB connected successfully
NoteNest AI backend running on http://localhost:5000
```

### Frontend

Open a second terminal:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open the Vite URL shown in the terminal.

## Environment example

```env
PORT=5000
MONGO_URI=your_mongodb_atlas_uri
JWT_SECRET=change_this_secret
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

Never upload your real `.env` file to GitHub.


## FIXED VERSION — September 2026

This build fixes three issues:

### 1. Duplicate note saves
- Save is locked while a request is running.
- The button becomes `Saving...`.
- A client request ID is stored so the same submission cannot be inserted twice by accidental double-click/network retry.

Existing duplicate notes already in MongoDB are not automatically deleted. Delete those old duplicate cards once.

### 2. Editor clears after Save
After a successful new-note save, the editor resets:
- title
- content
- subject/topic
- tags
- attachment preview
- selected colour

So the uploaded file no longer stays visible in the Create form after the note has been saved.

### 3. AI can read uploaded files
The backend now extracts readable text from:
- TXT / Markdown
- normal text PDFs
- scanned PDFs (OCR fallback, first 6 pages)
- DOC
- DOCX
- JPG / PNG / WEBP / GIF images (OCR)

The extracted content is sent to the same Summary / Key Points / Simplify / Revision Sheet pipeline.

Important:
- OCR quality depends on image quality.
- The first OCR request can take longer because Tesseract initializes language data.
- Very long files are capped for safety.
- Password-protected PDFs may not be readable.
