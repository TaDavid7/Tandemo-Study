// The folder export/import file. The format is described in folderDetails.md
// at the root of the repo; keep the two in step.
import type { Card } from "@/lib/api";

export const FOLDER_FILE_FORMAT = "nandemo-folder";
export const FOLDER_FILE_VERSION = 1;

/** Most cards one import may hold. Same as MAX_IMPORT_CARDS in backend/routes/flashcards.js. */
export const MAX_IMPORT_CARDS = 500;
/** Cards sent per request while importing. Same as IMPORT_BATCH_SIZE in backend/routes/flashcards.js. */
export const IMPORT_BATCH_SIZE = 25;
/** Longest question or answer, same as the card dialog and the server. */
export const MAX_CARD_CHARS = 500;
/** Largest file the import accepts. 500 full-length cards fit with room to spare. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type FolderFileCard = { question: string; answer: string };

export type FolderFile = {
  format: typeof FOLDER_FILE_FORMAT;
  version: typeof FOLDER_FILE_VERSION;
  name: string;
  exportedAt?: string;
  cards: FolderFileCard[];
};

/** The text of an export file for a folder and its cards. */
export function buildFolderFile(name: string, cards: Card[]): string {
  const file: FolderFile = {
    format: FOLDER_FILE_FORMAT,
    version: FOLDER_FILE_VERSION,
    name,
    exportedAt: new Date().toISOString(),
    cards: cards.map((c) => ({ question: c.question, answer: c.answer })),
  };
  return JSON.stringify(file, null, 2);
}

/** Starts a download of `text` as a file in the browser. */
export function downloadTextFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right after click() can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A file name for a folder's export, safe on every operating system. */
export function exportFileName(folderName: string) {
  const safe = folderName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "folder";
  return `${safe}.json`;
}

export type ParseResult =
  | { ok: true; name: string; cards: FolderFileCard[] }
  | { ok: false; errors: string[] };

const MAX_ERRORS_SHOWN = 5;

/**
 * Reads and checks an import file. Nothing is sent to the server unless the
 * whole file is valid. `fileName` names the folder when the file has no name.
 */
export function parseFolderFile(text: string, fileName: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ['The file must be a JSON object with a "cards" list.'] };
  }
  const obj = data as Record<string, unknown>;

  if (obj.format !== undefined && obj.format !== FOLDER_FILE_FORMAT) {
    return { ok: false, errors: [`"format" must be "${FOLDER_FILE_FORMAT}".`] };
  }
  if (obj.version !== undefined && obj.version !== FOLDER_FILE_VERSION) {
    return { ok: false, errors: [`This app reads version ${FOLDER_FILE_VERSION} files. This file is version ${String(obj.version)}.`] };
  }
  if (obj.name !== undefined && typeof obj.name !== "string") {
    return { ok: false, errors: ['"name" must be text.'] };
  }
  if (!Array.isArray(obj.cards)) {
    return { ok: false, errors: ['The file needs a "cards" list.'] };
  }
  if (obj.cards.length === 0) {
    return { ok: false, errors: ["The file has no cards."] };
  }
  if (obj.cards.length > MAX_IMPORT_CARDS) {
    return { ok: false, errors: [`The file has ${obj.cards.length} cards. An import can have at most ${MAX_IMPORT_CARDS}.`] };
  }

  const errors: string[] = [];
  const cards: FolderFileCard[] = [];
  obj.cards.forEach((raw, i) => {
    const n = i + 1;
    const c = raw as Record<string, unknown> | null;
    const question = typeof c?.question === "string" ? c.question.trim() : "";
    const answer = typeof c?.answer === "string" ? c.answer.trim() : "";
    if (!question) errors.push(`Card ${n}: "question" is missing or empty.`);
    else if (question.length > MAX_CARD_CHARS) errors.push(`Card ${n}: the question is longer than ${MAX_CARD_CHARS} characters.`);
    if (!answer) errors.push(`Card ${n}: "answer" is missing or empty.`);
    else if (answer.length > MAX_CARD_CHARS) errors.push(`Card ${n}: the answer is longer than ${MAX_CARD_CHARS} characters.`);
    cards.push({ question, answer });
  });
  if (errors.length) {
    const more = errors.length - MAX_ERRORS_SHOWN;
    return { ok: false, errors: more > 0 ? [...errors.slice(0, MAX_ERRORS_SHOWN), `…and ${more} more.`] : errors };
  }

  const fromFile = fileName.replace(/\.json$/i, "").trim();
  const name = (typeof obj.name === "string" && obj.name.trim()) || fromFile || "Imported folder";
  return { ok: true, name, cards };
}

/** `name`, or "name (2)", "name (3)"… when a folder already has that name. */
export function uniqueFolderName(name: string, taken: string[]) {
  const names = new Set(taken);
  if (!names.has(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!names.has(candidate)) return candidate;
  }
}

/** Splits `items` into groups of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
