import { useEffect, useMemo, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SERVER = API.replace(/\/api\/?$/, "");

const NOTE_COLORS = [
  "#EEF2FF",
  "#F3E8FF",
  "#FCE7F3",
  "#FFE4E6",
  "#FEF3C7",
  "#DCFCE7",
  "#CCFBF1",
  "#E0F2FE",
];

const AI_ACTIONS = [
  { id: "summary", label: "Summarize", icon: "✦", help: "Compact study summary" },
  { id: "keypoints", label: "Key points", icon: "•", help: "Exam-focused bullets" },
  { id: "simplify", label: "Simplify", icon: "Aa", help: "Easier explanation" },
  { id: "revision", label: "Revision sheet", icon: "✓", help: "Last-minute revision" },
];

function apiFetch(path, options = {}, token = "") {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  return fetch(`${API}${path}`, { ...options, headers }).then(async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || "Request failed");
    }

    return data;
  });
}

function formatBytes(bytes = 0) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const data = await apiFetch(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(
          mode === "register" ? { name, email, password } : { email, password }
        ),
      });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-orb orb-one" />
      <div className="auth-orb orb-two" />

      <div className="auth-layout">
        <section className="auth-copy">
          <div className="brand-lockup">
            <div className="brand-mark">N</div>
            <div>
              <strong>NoteNest AI</strong>
              <span>Student Notes & Revision Assistant</span>
            </div>
          </div>

          <p className="hero-kicker">SMARTER NOTES. FASTER REVISION.</p>
          <h1>Your study notes, organized beautifully and ready for AI.</h1>
          <p className="hero-copy">
            Create notes, attach files and images, keep subjects organized, then turn
            selected material into summaries, key points, simpler explanations and
            revision sheets.
          </p>

          <div className="auth-feature-row">
            <span>✓ MERN stack</span>
            <span>✓ CRUD + uploads</span>
            <span>✓ AI revision tools</span>
          </div>
        </section>

        <section className="auth-card glass">
          <div className="auth-tabs">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
              type="button"
            >
              Create account
            </button>
          </div>

          <div className="auth-card-heading">
            <h2>{mode === "login" ? "Welcome back" : "Create your workspace"}</h2>
            <p>
              {mode === "login"
                ? "Continue building your study library."
                : "Start storing and revising your notes in one place."}
            </p>
          </div>

          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <label>
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </label>

            {error && <div className="error-box">{error}</div>}

            <button className="primary full large" disabled={busy} type="submit">
              {busy
                ? "Please wait..."
                : mode === "login"
                ? "Login to NoteNest"
                : "Create account"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function FilePreview({ file, onRemove }) {
  const isImage = file.mimeType?.startsWith("image/");

  return (
    <div className="attachment-preview">
      {isImage ? (
        <img src={`${SERVER}${file.url}`} alt={file.originalName} />
      ) : (
        <div className="file-icon">📄</div>
      )}

      <div className="attachment-preview-copy">
        <strong title={file.originalName}>{file.originalName}</strong>
        <span>{formatBytes(file.size)}</span>
        <small className={
          file.extractionStatus === "ready"
            ? "extract-status ready"
            : "extract-status"
        }>
          {file.extractionStatus === "ready"
            ? "✓ AI-ready"
            : file.extractionStatus === "failed"
            ? "Text extraction unavailable"
            : "Preparing for AI"}
        </small>
      </div>

      {onRemove && (
        <button className="icon-button" type="button" onClick={onRemove} title="Remove">
          ×
        </button>
      )}
    </div>
  );
}

function NoteEditor({ editing, onSave, onCancel, token }) {
  const [subject, setSubject] = useState("General");
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [clientRequestId, setClientRequestId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );

  useEffect(() => {
    if (editing) {
      setSubject(editing.subject || "General");
      setTopic(editing.topic || "");
      setTitle(editing.title || "");
      setContent(editing.content || "");
      setTags((editing.tags || []).join(", "));
      setAttachments(editing.attachments || []);
      setColor(editing.color || NOTE_COLORS[0]);
    } else {
      setSubject("General");
      setTopic("");
      setTitle("");
      setContent("");
      setTags("");
      setAttachments([]);
      setColor(NOTE_COLORS[0]);
    }
  }, [editing]);

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploading(true);

    try {
      for (const file of files) {
        const textFile =
          file.type === "text/plain" ||
          file.type === "text/markdown" ||
          file.name.toLowerCase().endsWith(".txt") ||
          file.name.toLowerCase().endsWith(".md");

        if (textFile) {
          const imported = await file.text();
          if (imported.trim()) {
            setContent((old) =>
              [old.trim(), imported.trim()].filter(Boolean).join("\n\n")
            );
          }
        }
      }

      const body = new FormData();
      files.forEach((file) => body.append("files", file));

      const response = await fetch(`${API}/uploads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Upload failed");
      }

      setAttachments((current) => [...current, ...data.files]);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function submit(event) {
    event.preventDefault();

    if (saveLock.current) {
      return;
    }

    if (!content.trim() && attachments.length === 0) {
      alert("Add some note text or attach a file.");
      return;
    }

    saveLock.current = true;
    setSaving(true);

    try {
      const success = await onSave({
        subject,
        topic,
        title,
        content,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        attachments,
        color,
        clientRequestId: editing ? undefined : clientRequestId,
      });

      if (success && !editing) {
        setSubject("General");
        setTopic("");
        setTitle("");
        setContent("");
        setTags("");
        setAttachments([]);
        setColor(NOTE_COLORS[0]);

        setClientRequestId(
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`
        );
      }
    } finally {
      setSaving(false);
      saveLock.current = false;
    }
  }

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <section
      id="note-editor"
      className={`panel editor-panel ${editing ? "editing-active" : ""}`}
    >
      <div className="section-title-row">
        <div>
          <p className="eyebrow">{editing ? "UPDATE NOTE" : "CREATE"}</p>
          <h2>{editing ? "Edit your note" : "Create a study note"}</h2>
          <p className="section-description">
            Store typed notes, images or documents in the same study card.
          </p>
          {editing && <p className="editing-label">Editing: {editing.title}</p>}
        </div>

        {editing && (
          <button className="ghost" type="button" onClick={onCancel}>
            Cancel edit
          </button>
        )}
      </div>

      <form onSubmit={submit} className="note-form">
        <div className="form-grid two">
          <label>
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="DBMS"
            />
          </label>

          <label>
            Topic
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Normalization"
            />
          </label>
        </div>

        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="3NF and transitive dependency"
            required
          />
        </label>

        <label>
          Notes
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type or paste your study notes here..."
          />
        </label>

        <div className="form-grid two">
          <label>
            Tags
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="exam, module-2, important"
            />
          </label>

          <div className="color-field">
            <span className="field-label">Card colour</span>
            <div className="color-palette">
              {NOTE_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`Choose ${item}`}
                  className={color === item ? "color-dot selected" : "color-dot"}
                  style={{ backgroundColor: item }}
                  onClick={() => setColor(item)}
                />
              ))}
            </div>
          </div>
        </div>

        <label className="upload-zone">
          <div className="upload-icon">↑</div>
          <div>
            <strong>{uploading ? "Uploading..." : "Attach files or images"}</strong>
            <span>JPG, PNG, WEBP, GIF, TXT, MD, PDF, DOC or DOCX · up to 8 MB</span>
          </div>
          <input
            type="file"
            multiple
            accept="image/*,.txt,.md,.pdf,.doc,.docx"
            onChange={handleFiles}
            disabled={uploading}
          />
        </label>

        {attachments.length > 0 && (
          <div className="attachment-grid">
            {attachments.map((file, index) => (
              <FilePreview
                key={`${file.filename}-${index}`}
                file={file}
                onRemove={() =>
                  setAttachments((items) =>
                    items.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
              />
            ))}
          </div>
        )}

        <div className="editor-footer">
          <span>
            {content.length} characters · {words} words · {attachments.length} attachment
            {attachments.length === 1 ? "" : "s"}
          </span>

          <button
            className="primary"
            type="submit"
            disabled={uploading || saving}
          >
            {saving
              ? editing
                ? "Updating..."
                : "Saving..."
              : editing
              ? "Update note"
              : "Save note"}
          </button>
        </div>
      </form>
    </section>
  );
}

function NoteCard({
  note,
  selected,
  onSelect,
  onRead,
  onEdit,
  onDelete,
  onPatch,
}) {
  const attachments = note.attachments || [];
  const image = attachments.find((file) => file.mimeType?.startsWith("image/"));

  return (
    <article
      className={`note-card ${selected ? "selected" : ""}`}
      style={{ "--note-tint": note.color || NOTE_COLORS[0] }}
    >
      <div className="note-color-bar" />

      {image && (
        <div className="note-cover">
          <img src={`${SERVER}${image.url}`} alt={image.originalName} />
        </div>
      )}

      <div className="note-card-body">
        <div className="note-card-head">
          <label className="select-box" title="Select for AI">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(note._id)}
            />
            <span>AI select</span>
          </label>

          <button
            className={`star ${note.favorite ? "on" : ""}`}
            onClick={() => onPatch(note, { favorite: !note.favorite })}
            title="Favorite"
            type="button"
          >
            {note.favorite ? "★" : "☆"}
          </button>
        </div>

        <div className="chips">
          <span className="subject-chip">{note.subject || "General"}</span>
          {note.topic && <span>{note.topic}</span>}
          {note.pinned && <span>📌 Pinned</span>}
        </div>

        <h3>{note.title}</h3>

        {note.content ? (
          <p className="note-text">{note.content}</p>
        ) : (
          <p className="note-text muted-note">Attachment-only note</p>
        )}

        {(note.tags || []).length > 0 && (
          <div className="tags">
            {note.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="attachment-count">
            📎 {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
          </div>
        )}

        <div className="note-date">
          Updated {new Date(note.updatedAt).toLocaleString()}
        </div>

        <div className="note-actions">
          <button
            type="button"
            onClick={() => onPatch(note, { pinned: !note.pinned })}
          >
            {note.pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" className="read-action" onClick={() => onRead(note)}>
            Read
          </button>
          <button type="button" onClick={() => onEdit(note)}>
            Edit
          </button>
          <button
            type="button"
            onClick={() => onPatch(note, { archived: !note.archived })}
          >
            {note.archived ? "Restore" : "Archive"}
          </button>
          <button className="danger" type="button" onClick={() => onDelete(note)}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function ReadModal({ note, onClose }) {
  if (!note) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <article
        className="read-modal"
        onClick={(event) => event.stopPropagation()}
        style={{ "--note-tint": note.color || NOTE_COLORS[0] }}
      >
        <div className="read-accent" />

        <div className="read-modal-head">
          <div>
            <div className="chips">
              <span className="subject-chip">{note.subject || "General"}</span>
              {note.topic && <span>{note.topic}</span>}
            </div>
            <h2>{note.title}</h2>
            <p className="muted">
              Updated {new Date(note.updatedAt).toLocaleString()}
            </p>
          </div>

          <button className="modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        {(note.tags || []).length > 0 && (
          <div className="tags read-tags">
            {note.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}

        {note.content ? (
          <div className="read-content">{note.content}</div>
        ) : (
          <div className="read-content muted">This note contains attachments only.</div>
        )}

        {(note.attachments || []).length > 0 && (
          <section className="read-attachments">
            <h3>Attachments</h3>

            <div className="read-attachment-grid">
              {note.attachments.map((file) =>
                file.mimeType?.startsWith("image/") ? (
                  <a
                    className="read-image"
                    href={`${SERVER}${file.url}`}
                    target="_blank"
                    rel="noreferrer"
                    key={file.filename}
                  >
                    <img src={`${SERVER}${file.url}`} alt={file.originalName} />
                    <span>{file.originalName}</span>
                  </a>
                ) : (
                  <a
                    className="document-link"
                    href={`${SERVER}${file.url}`}
                    target="_blank"
                    rel="noreferrer"
                    key={file.filename}
                  >
                    <span className="document-icon">📄</span>
                    <span>
                      <strong>{file.originalName}</strong>
                      <small>{formatBytes(file.size)}</small>
                    </span>
                  </a>
                )
              )}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}

function AIWorkspace({ selectedNotes, onRun, busy, result, onClear, onSaveAsNote }) {
  return (
    <section className="panel ai-panel">
      <div className="ai-heading">
        <div className="ai-icon">✦</div>
        <div>
          <p className="eyebrow">AI STUDY ASSISTANT</p>
          <h2>Turn your own notes into revision material</h2>
          <p className="section-description">
            Select one or more saved notes below, then choose the study output you need.
          </p>
        </div>
      </div>

      <div className="selection-summary">
        <div className="selection-number">{selectedNotes.length}</div>
        <div>
          <strong>{selectedNotes.length === 1 ? "note selected" : "notes selected"}</strong>
          <span>
            {selectedNotes.length > 0
              ? selectedNotes.map((n) => n.title).join(" · ")
              : "Choose notes from your library"}
          </span>
        </div>
      </div>

      <div className="ai-actions">
        {AI_ACTIONS.map((action) => (
          <button
            key={action.id}
            disabled={!selectedNotes.length || busy}
            onClick={() => onRun(action.id)}
            type="button"
          >
            <span className="action-icon">{action.icon}</span>
            <span>
              <strong>{action.label}</strong>
              <small>{action.help}</small>
            </span>
          </button>
        ))}
      </div>

      {busy && (
        <div className="ai-loading">
          <span className="spinner" />
          NoteNest AI is working on your notes...
        </div>
      )}

      {result && !busy && (
        <div className="ai-result">
          <div className="result-toolbar">
            <div>
              <strong>
                {AI_ACTIONS.find((a) => a.id === result.mode)?.label || "AI result"}
              </strong>
              <span className="provider-badge">
                {result.provider === "openai"
                  ? `OpenAI · ${result.model}`
                  : "Local demo · not generative AI"}
              </span>
            </div>

            <div className="result-actions">
              <button
                className="ghost"
                type="button"
                onClick={() => navigator.clipboard.writeText(result.text)}
              >
                Copy
              </button>
              <button className="ghost" type="button" onClick={onSaveAsNote}>
                Save as note
              </button>
              <button className="ghost" type="button" onClick={onClear}>
                Clear
              </button>
            </div>
          </div>

          {(result.warnings || []).length > 0 && (
            <div className="ai-warning">
              <strong>Some files could not be fully read:</strong>
              {result.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          )}

          <pre>{result.text}</pre>
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value, hint, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{hint}</small>
      </div>
    </div>
  );
}

function Dashboard({ auth, onLogout }) {
  const token = auth.token;

  const [notes, setNotes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [reading, setReading] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState("active");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [dark, setDark] = useState(
    () => localStorage.getItem("notenest-theme") === "dark"
  );

  useEffect(() => {
    localStorage.setItem("notenest-theme", dark ? "dark" : "light");
  }, [dark]);

  async function loadNotes() {
    setLoading(true);
    setError("");

    try {
      const data = await apiFetch("/notes", {}, token);
      setNotes(data);
      setSelectedIds((ids) =>
        ids.filter((id) => data.some((note) => note._id === id))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotes();
  }, []);

  async function saveNote(payload) {
    try {
      if (editing) {
        await apiFetch(
          `/notes/${editing._id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          token
        );
        setEditing(null);
      } else {
        await apiFetch(
          "/notes",
          { method: "POST", body: JSON.stringify(payload) },
          token
        );
      }

      await loadNotes();
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    }
  }

  async function patchNote(note, updates) {
    try {
      const updated = await apiFetch(
        `/notes/${note._id}`,
        { method: "PUT", body: JSON.stringify(updates) },
        token
      );

      setNotes((items) =>
        items.map((item) => (item._id === updated._id ? updated : item))
      );
    } catch (err) {
      alert(err.message);
    }
  }

  function startEditing(note) {
    setEditing(note);

    window.requestAnimationFrame(() => {
      document.getElementById("note-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function readNote(note) {
    try {
      const fullNote = await apiFetch(`/notes/${note._id}`, {}, token);
      setReading(fullNote);
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteNote(note) {
    if (!window.confirm(`Delete “${note.title}” permanently?`)) return;

    try {
      await apiFetch(`/notes/${note._id}`, { method: "DELETE" }, token);
      setSelectedIds((ids) => ids.filter((id) => id !== note._id));
      if (reading?._id === note._id) setReading(null);
      await loadNotes();
    } catch (err) {
      alert(err.message);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
    );
  }

  const subjects = useMemo(
    () => ["All", ...new Set(notes.map((note) => note.subject || "General"))],
    [notes]
  );

  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();

    const data = notes.filter((note) => {
      const viewMatch = view === "archived" ? note.archived : !note.archived;
      const favoriteMatch = !favoritesOnly || note.favorite;
      const subjectMatch =
        subjectFilter === "All" || note.subject === subjectFilter;

      const searchMatch =
        !q ||
        [
          note.title,
          note.content,
          note.subject,
          note.topic,
          ...(note.tags || []),
          ...(note.attachments || []).map((file) => file.originalName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      return viewMatch && favoriteMatch && subjectMatch && searchMatch;
    });

    return [...data].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return Number(b.pinned) - Number(a.pinned);
      }

      if (sort === "oldest") {
        return new Date(a.createdAt) - new Date(b.createdAt);
      }

      if (sort === "az") {
        return a.title.localeCompare(b.title);
      }

      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }, [notes, search, subjectFilter, sort, view, favoritesOnly]);

  const selectedNotes = notes.filter((note) => selectedIds.includes(note._id));

  const activeNotes = notes.filter((note) => !note.archived);
  const favoriteCount = notes.filter((note) => note.favorite).length;
  const subjectCount = new Set(notes.map((note) => note.subject || "General")).size;

  async function runAI(mode) {
    setAiBusy(true);
    setAiResult(null);

    try {
      const result = await apiFetch(
        "/ai/study",
        {
          method: "POST",
          body: JSON.stringify({ noteIds: selectedIds, mode }),
        },
        token
      );

      setAiResult(result);
    } catch (err) {
      alert(err.message);
    } finally {
      setAiBusy(false);
    }
  }

  async function saveAIAsNote() {
    if (!aiResult) return;

    const first = selectedNotes[0];
    const action =
      AI_ACTIONS.find((a) => a.id === aiResult.mode)?.label || "AI Study Result";

    try {
      await apiFetch(
        "/notes",
        {
          method: "POST",
          body: JSON.stringify({
            subject: first?.subject || "AI Revision",
            topic: "AI Generated",
            title: `${action}: ${
              selectedNotes.length === 1
                ? first.title
                : `${selectedNotes.length} selected notes`
            }`,
            content: aiResult.text,
            tags: ["ai", "revision"],
            color: "#F3E8FF",
          }),
        },
        token
      );

      await loadNotes();
      setAiResult(null);
      alert("AI result saved as a new note.");
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className={dark ? "app dark" : "app"}>
      <ReadModal note={reading} onClose={() => setReading(null)} />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark small">N</div>
          <div>
            <strong>NoteNest AI</strong>
            <span>Student Notes & Revision Assistant</span>
          </div>
        </div>

        <div className="top-actions">
          <span className="welcome">Hi, {auth.user.name}</span>
          <button className="ghost" type="button" onClick={() => setDark((v) => !v)}>
            {dark ? "☀ Light" : "☾ Dark"}
          </button>
          <button className="ghost" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard">
        {error && <div className="error-box">{error}</div>}

        <section className="welcome-banner">
          <div>
            <p className="eyebrow">YOUR STUDY SPACE</p>
            <h1>Keep everything in one place. Revise what matters.</h1>
            <p>
              Store class notes, screenshots and documents, then use your own material
              for AI-powered revision.
            </p>
          </div>

          <button
            className="primary large"
            type="button"
            onClick={() =>
              document.getElementById("note-editor")?.scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            + New note
          </button>
        </section>

        <section className="stats-grid">
          <StatCard
            icon="🗂"
            value={activeNotes.length}
            label="Active notes"
            hint="Your current library"
          />
          <StatCard
            icon="★"
            value={favoriteCount}
            label="Favorites"
            hint="Important material"
          />
          <StatCard
            icon="◫"
            value={subjectCount}
            label="Subjects"
            hint="Organized areas"
          />
          <StatCard
            icon="✦"
            value={selectedIds.length}
            label="Selected for AI"
            hint="Ready to process"
          />
        </section>

        <div className="workspace-grid">
          <NoteEditor
            editing={editing}
            onSave={saveNote}
            onCancel={() => setEditing(null)}
            token={token}
          />

          <AIWorkspace
            selectedNotes={selectedNotes}
            onRun={runAI}
            busy={aiBusy}
            result={aiResult}
            onClear={() => setAiResult(null)}
            onSaveAsNote={saveAIAsNote}
          />
        </div>

        <section className="panel library-panel">
          <div className="library-top">
            <div>
              <p className="eyebrow">LIBRARY</p>
              <h2>Your notes</h2>
              <p className="section-description">
                Search, read, edit and organize everything you have stored.
              </p>
            </div>

            <div className="library-buttons">
              {visibleNotes.length > 0 && (
                <button
                  className="ghost"
                  type="button"
                  onClick={() =>
                    setSelectedIds(visibleNotes.slice(0, 20).map((note) => note._id))
                  }
                >
                  Select visible for AI
                </button>
              )}

              {selectedIds.length > 0 && (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setSelectedIds([])}
                >
                  Clear {selectedIds.length} selected
                </button>
              )}
            </div>
          </div>

          <div className="view-tabs">
            <button
              className={view === "active" ? "active" : ""}
              type="button"
              onClick={() => setView("active")}
            >
              Notes
            </button>
            <button
              className={view === "archived" ? "active" : ""}
              type="button"
              onClick={() => setView("archived")}
            >
              Archive
            </button>
            <button
              className={favoritesOnly ? "active" : ""}
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              ★ Favorites
            </button>
          </div>

          <div className="filters">
            <div className="search-field">
              <span>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, content, subject, topic, tag or attachment..."
              />
            </div>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              {subjects.map((subject) => (
                <option key={subject}>{subject}</option>
              ))}
            </select>

            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="updated">Recently updated</option>
              <option value="oldest">Oldest first</option>
              <option value="az">Title A–Z</option>
            </select>
          </div>
        </section>

        <section className="notes-area">
          <div className="notes-count">
            <strong>{visibleNotes.length}</strong>{" "}
            {visibleNotes.length === 1 ? "note" : "notes"}
          </div>

          {loading ? (
            <div className="empty-state">Loading notes...</div>
          ) : visibleNotes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✎</div>
              <strong>No notes here yet.</strong>
              <span>Create a note above or change the filters.</span>
            </div>
          ) : (
            <div className="notes-grid">
              {visibleNotes.map((note) => (
                <NoteCard
                  key={note._id}
                  note={note}
                  selected={selectedIds.includes(note._id)}
                  onSelect={toggleSelected}
                  onRead={readNote}
                  onEdit={startEditing}
                  onDelete={deleteNote}
                  onPatch={patchNote}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("notenest-auth")) || null;
    } catch {
      return null;
    }
  });

  function handleAuth(data) {
    const value = { token: data.token, user: data.user };
    localStorage.setItem("notenest-auth", JSON.stringify(value));
    setAuth(value);
  }

  function logout() {
    localStorage.removeItem("notenest-auth");
    setAuth(null);
  }

  if (!auth) return <AuthScreen onAuth={handleAuth} />;
  return <Dashboard auth={auth} onLogout={logout} />;
}
