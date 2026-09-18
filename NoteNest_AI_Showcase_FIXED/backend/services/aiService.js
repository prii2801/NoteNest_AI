const MODE_INSTRUCTIONS = {
  summary:
    "Create a concise study summary. Preserve definitions, formulas, named concepts, steps and important examples. Use clear headings and bullet points. Do not invent facts that are not present in the notes.",
  keypoints:
    "Extract the most exam-relevant key points. Use short bullets. Include definitions, formulas, processes, contrasts and likely-to-be-forgotten details. Do not invent information.",
  simplify:
    "Explain these notes in simple student-friendly language without losing technical accuracy. Define jargon briefly and use a small example where the notes support one. Do not add unsupported facts.",
  revision:
    "Turn these notes into a last-minute revision sheet. Organize by subject/topic. Include core ideas, must-remember facts, formulas or steps if present, and a short checklist at the end. Do not invent information.",
};

function buildPrompt(notes, mode) {
  const joined = notes
    .map((note, index) =>
      [
        `NOTE ${index + 1}`,
        `Subject: ${note.subject || "General"}`,
        `Topic: ${note.topic || "Not specified"}`,
        `Title: ${note.title}`,
        `Content:\n${note.content}`,
      ].join("\n")
    )
    .join("\n\n---\n\n");

  return `${MODE_INSTRUCTIONS[mode]}\n\nSOURCE NOTES:\n${joined}`;
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const pieces = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        pieces.push(content.text);
      }
    }
  }

  return pieces.join("\n").trim();
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
}

const STOP = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "have",
  "has",
  "were",
  "was",
  "are",
  "for",
  "into",
  "their",
  "there",
  "then",
  "than",
  "when",
  "what",
  "which",
  "will",
  "would",
  "could",
  "should",
  "about",
  "because",
  "while",
  "where",
  "your",
  "they",
  "them",
  "also",
  "using",
  "used",
  "use",
  "not",
  "but",
  "can",
  "its",
  "our",
  "you",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "is",
  "it",
  "as",
  "by",
  "or",
  "be",
  "at",
]);

function uniqueLines(lines) {
  const seen = new Set();
  const result = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    const key = line.toLowerCase();

    if (line.length < 12 || seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }

  return result;
}

function importantSentences(text, limit = 7) {
  let sentences = splitSentences(text);

  if (sentences.length === 0) {
    sentences = uniqueLines(
      text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
    );
  }

  const frequencies = {};
  const words = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];

  for (const word of words) {
    if (!STOP.has(word)) {
      frequencies[word] = (frequencies[word] || 0) + 1;
    }
  }

  return sentences
    .map((sentence, index) => {
      const sentenceWords =
        sentence.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];

      const frequencyScore =
        sentenceWords.reduce(
          (sum, word) => sum + (frequencies[word] || 0),
          0
        ) / Math.max(sentenceWords.length, 1);

      const detailBonus =
        (/[0-9]/.test(sentence) ? 0.45 : 0) +
        (/[:=]/.test(sentence) ? 0.3 : 0) +
        (/\b(required|important|must|definition|formula|status|safety|result|conclusion)\b/i.test(sentence)
          ? 0.4
          : 0);

      return {
        sentence,
        score: frequencyScore + detailBonus,
        index,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

function shortKeyPoint(sentence) {
  let line = sentence
    .replace(/\bStatus:\s*/gi, "Status: ")
    .replace(/\s+/g, " ")
    .trim();

  if (line.length > 210) {
    line = `${line.slice(0, 207).trim()}...`;
  }

  return line;
}

function localDemo(notes, mode) {
  const subjects = [
    ...new Set(notes.map((note) => note.subject || "General")),
  ].join(", ");

  const combined = notes
    .map((note) => `${note.title}. ${note.content}`)
    .join(" ");

  if (mode === "summary") {
    const summaryLines = importantSentences(combined, 6);

    return [
      `STUDY SUMMARY — ${subjects}`,
      "",
      ...summaryLines.map((line) => `• ${shortKeyPoint(line)}`),
      "",
      "Demo note: this is an extractive summary made from readable text in your selected notes and attachments.",
    ].join("\n");
  }

  if (mode === "keypoints") {
    const candidates = uniqueLines(
      notes.flatMap((note) => [
        ...note.content.split(/\n+/),
        ...splitSentences(note.content),
      ])
    );

    const ranked = candidates
      .map((line) => {
        const score =
          (/[0-9]/.test(line) ? 3 : 0) +
          (/[:=]/.test(line) ? 2 : 0) +
          (/\b(required|must|important|safety|definition|formula|status|result|conclusion|advantage|disadvantage)\b/i.test(line)
            ? 3
            : 0) +
          Math.min(line.length / 120, 1);

        return { line, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => item.line);

    return [
      `KEY POINTS — ${subjects}`,
      "",
      ...ranked.map((line) => `• ${shortKeyPoint(line)}`),
    ].join("\n");
  }

  if (mode === "simplify") {
    const source = importantSentences(combined, 6);

    const simplified = source.map((sentence) => {
      const parts = sentence
        .replace(/[;]+/g, ".")
        .split(/,\s+(?=[A-Za-z])/)
        .map((part) => part.trim())
        .filter(Boolean);

      const main = parts[0] || sentence;
      const extra = parts.slice(1, 3);

      if (extra.length === 0) {
        return `• ${shortKeyPoint(main)}`;
      }

      return `• ${shortKeyPoint(main)}\n  ↳ ${extra
        .map((part) => shortKeyPoint(part))
        .join("\n  ↳ ")}`;
    });

    return [
      `SIMPLIFIED NOTES — ${subjects}`,
      "",
      ...simplified,
      "",
      "Demo limitation: this mode can reorganize and shorten your wording, but true AI paraphrasing requires an API key.",
    ].join("\n");
  }

  if (mode === "revision") {
    const sections = notes.map((note) => {
      const important = importantSentences(note.content, 4);

      return [
        `${(note.subject || "General").toUpperCase()} — ${note.topic || note.title}`,
        `Title: ${note.title}`,
        ...important.map((line) => `• ${shortKeyPoint(line)}`),
      ].join("\n");
    });

    return [
      `LAST-MINUTE REVISION SHEET — ${subjects}`,
      "",
      ...sections.flatMap((section) => [section, ""]),
      "QUICK CHECKLIST",
      "□ Can I explain the main idea without looking?",
      "□ Have I remembered the important numbers, formulas or steps?",
      "□ Can I identify the key definitions and constraints?",
      "□ Do I know which points need deeper revision?",
    ].join("\n");
  }

  return "Unsupported demo mode";
}

export async function runStudyAssistant(notes, mode) {
  if (!MODE_INSTRUCTIONS[mode]) {
    throw new Error("Unsupported AI mode");
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      text: localDemo(notes, mode),
      provider: "local-demo",
      model: "extractive-demo",
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      instructions:
        "You are NoteNest AI, a careful study assistant. Work only from the student's supplied notes. Never claim unsupported facts are in the notes. Return clean plain text with readable headings and bullet points.",
      input: buildPrompt(notes, mode),
      max_output_tokens: 1400,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const text = extractResponseText(data);
  if (!text) {
    throw new Error("AI returned an empty response");
  }

  return { text, provider: "openai", model };
}
