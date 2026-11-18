"use client";
import React, { FormEvent, memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, authfetch, Card, Folder, useCards, useClientValue, useFolders, useRequireAuth } from "@/lib/api";
import { Button, EASE_OUT, Field, FlipCard, Kbd, Modal, Notice, Panel, Swipeable, inputClass } from "@/components/ui";
import { useMobile } from "@/components/AppShell";
import {
  IMPORT_BATCH_SIZE, MAX_FILE_BYTES, MAX_IMPORT_CARDS, FolderFileCard,
  buildFolderFile, chunk, downloadTextFile, exportFileName, parseFolderFile, uniqueFolderName,
} from "@/lib/folderFile";

/** See the deck's motion.div: its presence keeps every value of that animation in Motion's JS loop. */
const keepOpacityInJs = () => {};

/** Which way the deck last moved, and whether a swipe did it. */
type Move = { dir: number; swipe: boolean };

type Dialog =
  | { kind: "card"; card?: Card }
  | { kind: "pdf" }
  | { kind: "import" }
  | { kind: "importInto" }
  | { kind: "rename" }
  | { kind: "deleteFolder" }
  | { kind: "deleteCard"; card: Card }
  | null;

export default function DecksPage() {
  const signedIn = useRequireAuth();
  const { folders, setFolders, loading: foldersLoading } = useFolders();
  // The open folder: the one picked here, else the one open last time, else the first.
  // "" while folders load or after deleting the open one.
  const [pickedFolder, setFolderId] = useState("");
  const lastFolder = useClientValue(() => localStorage.getItem("lastFolder"), null);
  const hasFolder = (id: string | null) => !!id && folders.some((f) => f._id === id);
  const folderId = hasFolder(pickedFolder) ? pickedFolder : hasFolder(lastFolder) ? lastFolder! : folders[0]?._id ?? "";
  const { cards, setCards, reload, loading: cardsLoading } = useCards(folderId);
  // The current card and how the deck got there, kept together so callbacks can update
  // both from the previous value without depending on it (see openCard).
  const [pos, setPos] = useState<{ index: number; move: Move }>({ index: 0, move: { dir: 1, swipe: false } });
  const { index, move: direction } = pos;
  const [flipped, setFlipped] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const mobile = useMobile();

  const folder = folders.find((f) => f._id === folderId);

  // Remember the open folder for next time.
  useEffect(() => {
    if (folderId) localStorage.setItem("lastFolder", folderId);
  }, [folderId]);

  // A different folder starts at its first card, question side up.
  const [shownFolder, setShownFolder] = useState(folderId);
  if (folderId !== shownFolder) {
    setShownFolder(folderId);
    setPos((p) => ({ ...p, index: 0 }));
    setFlipped(false);
  }

  const go = (step: number, swipe = false) => {
    if (!cards.length) return;
    setFlipped(false);
    setPos((p) => ({ index: (p.index + step + cards.length) % cards.length, move: { dir: step, swipe } }));
  };

  // Stable callbacks, so the memoized sidebar and card list skip re-rendering when the deck moves.
  const openCard = useCallback((i: number) => {
    setPos((p) => ({ index: i, move: { dir: i > p.index ? 1 : -1, swipe: false } }));
    setFlipped(false);
  }, []);
  const editCard = useCallback((card: Card) => setDialog({ kind: "card", card }), []);
  const deleteCard = useCallback((card: Card) => setDialog({ kind: "deleteCard", card }), []);
  const folderCreated = useCallback((f: Folder) => {
    setFolders((all) => [...all, f]);
    setFolderId(f._id);
  }, [setFolders]);
  const openImport = useCallback(() => setDialog({ kind: "import" }), []);

  // Keyboard: ← → to move, space to flip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!signedIn) return null;

  const current = cards[Math.min(index, cards.length - 1)];

  return (
    <div className="grid grid-cols-[15rem_1fr] gap-12 mobile:grid-cols-1 mobile:gap-6">
      <FolderSidebar
        folders={folders}
        loading={foldersLoading}
        selected={folderId}
        onSelect={setFolderId}
        onCreated={folderCreated}
        onImport={openImport}
      />

      <section className="min-w-0">
        {!folder ? (
          <EmptyState
            title={foldersLoading ? "Loading…" : "Create your first folder"}
            body={foldersLoading ? "" : "Folders hold a set of cards, like one subject or one chapter. Name one on the left to get started."}
          />
        ) : (
          <>
            <div className="mb-8 flex items-end justify-between gap-6 mobile:mb-6 mobile:flex-col mobile:items-stretch mobile:gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-4xl font-bold tracking-tight mobile:text-3xl">{folder.name}</h1>
                <p className="mt-1.5 text-muted">
                  {cards.length} {cards.length === 1 ? "card" : "cards"}
                  <button onClick={() => setDialog({ kind: "rename" })} className="ml-4 underline-offset-4 hover:text-ink hover:underline">Rename</button>
                  <button
                    disabled={cardsLoading}
                    onClick={() => setDialog({ kind: "importInto" })}
                    className="ml-3 underline-offset-4 hover:text-ink hover:underline disabled:opacity-40"
                  >
                    Import cards
                  </button>
                  {cards.length > 0 && (
                    <button
                      disabled={cardsLoading}
                      onClick={() => downloadTextFile(exportFileName(folder.name), buildFolderFile(folder.name, cards))}
                      className="ml-3 underline-offset-4 hover:text-ink hover:underline disabled:opacity-40"
                    >
                      Export
                    </button>
                  )}
                  <button onClick={() => setDialog({ kind: "deleteFolder" })} className="ml-3 underline-offset-4 hover:text-bad hover:underline">Delete</button>
                </p>
              </div>
              <div className="flex shrink-0 gap-2 mobile:grid mobile:grid-cols-2">
                <Button variant="secondary" disabled onClick={() => setDialog({ kind: "pdf" })}>Import from PDF</Button>
                <Button onClick={() => setDialog({ kind: "card" })}>Add card</Button>
              </div>
            </div>

            {current ? (
              <>
                <div className="flex items-center gap-6">
                  <ArrowButton dir={-1} onClick={() => go(-1)} />
                  <div className="relative mx-auto h-[21.25rem] w-full max-w-[40rem] mobile:h-[17rem]">
                    {/* the rest of the deck peeking out behind the current card */}
                    {cards.length > 1 && <div className="absolute inset-0 translate-y-3 rotate-[1.5deg] rounded-xl border border-line bg-card/70" />}
                    {cards.length > 2 && <div className="absolute inset-0 translate-y-1.5 -rotate-1 rounded-xl border border-line bg-card/85" />}
                    <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                      <motion.div
                        key={current._id}
                        custom={direction}
                        className="absolute inset-0"
                        variants={{
                          enter: ({ dir }: Move) => ({ x: dir * 80, opacity: 0, rotate: dir * 3 }),
                          center: { x: 0, opacity: 1, rotate: 0 },
                          // A swiped card is already flying off under the finger (see Swipeable), so it only fades.
                          exit: ({ dir, swipe }: Move) =>
                            swipe
                              ? { opacity: 0, transition: { duration: 0.25, ease: EASE_OUT } }
                              : { x: dir * -140, opacity: 0, rotate: dir * -6 },
                        }}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: "spring", stiffness: 380, damping: 34 }}
                        // Any onUpdate keeps Motion from running the opacity fade as a browser
                        // (WAAPI) animation. That fade fell out of step with the JS-driven x and
                        // rotate: when the old card finished leaving, both cards jumped back to
                        // their starting opacity for a frame, so every move ended in a flicker.
                        onUpdate={keepOpacityInJs}
                      >
                        <Swipeable enabled={mobile} onSwipe={(step) => go(step, true)}>
                          <FlipCard
                            className="h-full"
                            front={current.question}
                            back={current.answer}
                            flipped={flipped}
                            onFlip={() => setFlipped((f) => !f)}
                          />
                        </Swipeable>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <ArrowButton dir={1} onClick={() => go(1)} />
                </div>

                <div className="mt-8 flex items-center justify-center gap-6 text-sm text-muted mobile:mt-6">
                  <span className="tabular-nums font-medium text-ink">{index + 1} / {cards.length}</span>
                  <span className="flex items-center gap-1.5 mobile:hidden"><Kbd>←</Kbd><Kbd>→</Kbd> move</span>
                  <span className="flex items-center gap-1.5 mobile:hidden"><Kbd>Space</Kbd> flip</span>
                  <span className="hidden mobile:inline">Swipe to move · tap to flip</span>
                </div>

                <CardList
                  cards={cards}
                  onOpen={openCard}
                  onEdit={editCard}
                  onDelete={deleteCard}
                />
              </>
            ) : (
              <EmptyState
                title="This folder is empty"
                body="Add cards one at a time, or import a PDF of your notes and cards will be written for you."
              >
                <div className="mt-6 flex justify-center gap-2">
                  <Button variant="secondary" disabled onClick={() => setDialog({ kind: "pdf" })}>Import from PDF</Button>
                  <Button onClick={() => setDialog({ kind: "card" })}>Add card</Button>
                </div>
              </EmptyState>
            )}
          </>
        )}
      </section>

      {/* ── Dialogs ── */}
      <CardDialog
        open={dialog?.kind === "card"}
        card={dialog?.kind === "card" ? dialog.card : undefined}
        folderId={folderId}
        onClose={() => setDialog(null)}
        onSaved={(saved, isNew) => {
          setCards((all) => (isNew ? [...all, saved] : all.map((c) => (c._id === saved._id ? saved : c))));
          if (isNew) { setPos({ index: cards.length, move: { dir: 1, swipe: false } }); setFlipped(false); }
        }}
      />
      <PdfDialog open={dialog?.kind === "pdf"} folderId={folderId} onClose={() => setDialog(null)} onImported={reload} />
      <ImportFolderDialog
        open={dialog?.kind === "import"}
        folderNames={folders.map((f) => f.name)}
        onClose={() => setDialog(null)}
        onImported={folderCreated}
      />
      {folder && (
        <ImportFolderDialog
          open={dialog?.kind === "importInto"}
          folderNames={folders.map((f) => f.name)}
          into={{ folder, count: cards.length }}
          onClose={() => setDialog(null)}
          onImported={reload}
        />
      )}
      <RenameDialog
        open={dialog?.kind === "rename"}
        folder={folder}
        onClose={() => setDialog(null)}
        onSaved={(f) => setFolders((all) => all.map((x) => (x._id === f._id ? f : x)))}
      />
      <ConfirmDialog
        open={dialog?.kind === "deleteFolder"}
        title={`Delete “${folder?.name}”?`}
        body={`This deletes the folder and all ${cards.length} of its cards. This can't be undone.`}
        action="Delete folder"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await api(`/api/folders/${folderId}`, "DELETE");
          setFolders((all) => all.filter((f) => f._id !== folderId));
          setFolderId("");
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "deleteCard"}
        title="Delete this card?"
        body={dialog?.kind === "deleteCard" ? dialog.card.question : ""}
        action="Delete card"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "deleteCard") return;
          const id = dialog.card._id;
          await api(`/api/flashcards/${id}`, "DELETE");
          setCards((all) => all.filter((c) => c._id !== id));
          setPos((p) => ({ ...p, index: Math.max(0, Math.min(p.index, cards.length - 2)) }));
        }}
      />
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────── */

// Memoized: its layoutId highlight makes Motion measure layout on every render.
const FolderSidebar = memo(function FolderSidebar({
  folders, loading, selected, onSelect, onCreated, onImport,
}: {
  folders: Folder[]; loading: boolean; selected: string;
  onSelect: (id: string) => void; onCreated: (f: Folder) => void; onImport: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      onCreated(await api<Folder>("/api/folders", "POST", { name: name.trim() }));
      setName("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <aside className="sticky top-28 self-start mobile:static">
      <h2 className="mb-3 px-3 text-sm font-medium text-muted">Folders</h2>
      <ul className="space-y-0.5 mobile:-mx-4 mobile:flex mobile:gap-2 mobile:space-y-0 mobile:overflow-x-auto mobile:px-4 mobile:pb-1">
        {sorted.map((f) => (
          <li key={f._id} className="mobile:shrink-0">
            <button
              onClick={() => onSelect(f._id)}
              className={`relative w-full truncate rounded-lg px-3 py-2 text-left text-[15px] transition mobile:w-auto mobile:whitespace-nowrap mobile:border mobile:border-line ${
                f._id === selected ? "font-semibold" : "text-muted hover:bg-ink/5 hover:text-ink"
              }`}
            >
              {f._id === selected && (
                <motion.span
                  layoutId="folder-highlight"
                  className="absolute inset-0 rounded-lg bg-card shadow-sm ring-1 ring-line"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                >
                  <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-hl" />
                </motion.span>
              )}
              <span className="relative">{f.name}</span>
            </button>
          </li>
        ))}
        {!loading && !folders.length && <li className="px-3 py-2 text-sm text-muted">No folders yet.</li>}
      </ul>

      <form onSubmit={create} className="mt-5 flex gap-2 border-t border-line pt-5 mobile:mt-3 mobile:border-t-0 mobile:pt-0">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder" required className={`${inputClass} h-9 text-sm`} />
        <Button size="sm" variant="secondary" className="h-9" aria-label="Create folder">Add</Button>
      </form>
      {error && <div className="mt-2"><Notice>{error}</Notice></div>}
      <Button size="sm" variant="ghost" className="mt-2 w-full justify-start px-3" onClick={onImport}>
        Import folder…
      </Button>
    </aside>
  );
});

function ArrowButton({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 1 ? "Next card" : "Previous card"}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-card text-muted transition hover:border-muted hover:text-ink active:scale-90 mobile:hidden"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d={dir === 1 ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Memoized and independent of the current card, so moving through the deck doesn't re-render every row.
const CardList = memo(function CardList({
  cards, onOpen, onEdit, onDelete,
}: {
  cards: Card[];
  onOpen: (i: number) => void; onEdit: (c: Card) => void; onDelete: (c: Card) => void;
}) {
  return (
    <div className="mt-16">
      <h2 className="mb-3 text-sm font-medium text-muted">All cards</h2>
      <Panel className="divide-y divide-line overflow-hidden">
        <AnimatePresence initial={false}>
          {cards.map((c, i) => (
            // The outer row only animates height and opacity; padding and the hover
            // color live on the inner row so CSS transitions never fight Motion.
            <motion.div
              key={c._id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div
                className="group grid grid-cols-[2.5rem_1fr_1fr_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-ink/[0.03] mobile:grid-cols-[1.25rem_minmax(0,1fr)_auto] mobile:gap-x-3 mobile:gap-y-0.5 mobile:px-3"
              >
                <span className="text-sm tabular-nums text-muted mobile:row-span-2 mobile:self-start mobile:pt-0.5">{i + 1}</span>
                <button onClick={() => onOpen(i)} className="truncate text-left font-medium">{c.question}</button>
                <button onClick={() => onOpen(i)} className="truncate text-left text-muted mobile:col-start-2 mobile:row-start-2 mobile:text-sm">{c.answer}</button>
                <span className="flex gap-1 opacity-60 transition-opacity group-hover:opacity-100 mobile:col-start-3 mobile:row-span-2 mobile:row-start-1 mobile:opacity-100">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="hover:text-bad" onClick={() => onDelete(c)}>Delete</Button>
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </Panel>
    </div>
  );
});

function EmptyState({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="index-card mx-auto mt-4 max-w-[40rem] rounded-xl border border-dashed border-line px-10 pb-12 pt-20 text-center mobile:px-6 mobile:pt-16"
    >
      <h2 className="font-card text-3xl">{title}</h2>
      {body && <p className="mx-auto mt-3 max-w-md text-muted">{body}</p>}
      {children}
    </motion.div>
  );
}

/* ── Dialogs ────────────────────────────────────────────── */

/**
 * Calls `reset` in the same render where `open` turns true. Resetting in an effect
 * instead lets the dialog paint one frame with the previous card's text first.
 */
function useResetOnOpen(open: boolean, reset: () => void) {
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) reset();
  }
}

// Same limit as the server (backend/routes/flashcards.js). Longer text shrinks to fit the card.
const MAX_CHARS = 500;

function CharCount({ text }: { text: string }) {
  const n = text.length;
  return (
    <span className={`block text-right text-xs tabular-nums ${n > MAX_CHARS ? "text-bad" : "text-muted"}`}>
      {n} / {MAX_CHARS} characters
    </span>
  );
}

function CardDialog({
  open, card, folderId, onClose, onSaved,
}: {
  open: boolean; card?: Card; folderId: string;
  onClose: () => void; onSaved: (c: Card, isNew: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);

  useResetOnOpen(open, () => { setQ(card?.question ?? ""); setA(card?.answer ?? ""); setError(null); });

  const save = async (e: FormEvent, keepOpen = false) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = card
        ? await api<Card>(`/api/flashcards/${card._id}`, "PATCH", { question: q, answer: a })
        : await api<Card>("/api/flashcards", "POST", { question: q, answer: a, folder: folderId });
      onSaved(saved, !card);
      if (keepOpen) { setQ(""); setA(""); questionRef.current?.focus(); } else onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const area = `${inputClass} h-auto resize-none py-2.5`;
  const tooLong = q.length > MAX_CHARS || a.length > MAX_CHARS;

  return (
    <Modal open={open} onClose={onClose} title={card ? "Edit card" : "Add card"}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Question">
          <textarea ref={questionRef} autoFocus rows={3} value={q} onChange={(e) => setQ(e.target.value)} required className={area} />
          <CharCount text={q} />
        </Field>
        <Field label="Answer">
          <textarea rows={3} value={a} onChange={(e) => setA(e.target.value)} required className={area} />
          <CharCount text={a} />
        </Field>
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          {!card && (
            <Button type="button" variant="secondary" disabled={saving || !q || !a || tooLong} onClick={(e) => save(e, true)}>
              Save and add another
            </Button>
          )}
          <Button disabled={saving || tooLong}>{card ? "Save changes" : "Save card"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PdfDialog({
  open, folderId, onClose, onImported,
}: { open: boolean; folderId: string; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  useResetOnOpen(open, () => { setFile(null); setStatus("idle"); setMessage(""); });

  const upload = async () => {
    if (!file) return;
    setStatus("loading");
    const form = new FormData();
    form.append("file", file);
    form.append("folderId", folderId);
    try {
      const res = await authfetch("/api/flashcards/import/pdf", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The PDF couldn't be imported.");
      const n = data.createdCount ?? data.cards?.length;
      setStatus("done");
      setMessage(n != null ? `Added ${n} card${n === 1 ? "" : "s"} to this folder.` : "Cards added to this folder.");
      onImported();
    } catch (err) {
      setStatus("error");
      setMessage((err as Error).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import from PDF">
      <p className="mb-4 text-sm text-muted">Upload your notes and AI writes question-and-answer cards from them.</p>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); setFile(e.dataTransfer.files[0] ?? null); }}
        className={`flex h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition ${
          dragging ? "border-info bg-info/5" : "border-line hover:border-muted"
        }`}
      >
        <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <span className="font-medium">{file ? file.name : "Drop a PDF here"}</span>
        <span className="mt-1 text-sm text-muted">{file ? "Click to choose a different file" : "or click to choose one"}</span>
      </label>
      <div className="mt-4 min-h-10">{message && <Notice tone={status === "error" ? "bad" : "good"}>{message}</Notice>}</div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>{status === "done" ? "Close" : "Cancel"}</Button>
        <Button onClick={upload} disabled={!file || status === "loading"}>
          {status === "loading" ? "Importing…" : "Import PDF"}
        </Button>
      </div>
    </Modal>
  );
}

/** Tries a request a few times before giving up, waiting a little longer each time. */
async function withRetries<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

type ImportState =
  | { step: "pick" }
  | { step: "ready"; fileName: string; cards: FolderFileCard[] }
  | { step: "importing"; done: number; total: number }
  | { step: "done"; name: string; total: number }
  | { step: "failed"; name: string; done: number; total: number; message: string };

/** The message when a file would take a folder past MAX_IMPORT_CARDS. Nothing is imported. */
function overLimitMessage(folderName: string, have: number, adding: number) {
  const room = Math.max(0, MAX_IMPORT_CARDS - have);
  return (
    `“${folderName}” has ${have} card${have === 1 ? "" : "s"} and the file has ${adding}. ` +
    `Together that's ${have + adding}, over the ${MAX_IMPORT_CARDS}-card limit, so nothing was imported. ` +
    (room > 0
      ? `This folder has room for ${room} more card${room === 1 ? "" : "s"}. Use a smaller file, or import it as a new folder.`
      : "This folder is full. Import the file as a new folder instead.")
  );
}

/**
 * Reads a folder file (format in folderDetails.md), checks every card, then sends the
 * cards IMPORT_BATCH_SIZE at a time rather than all at once. Without `into` the cards
 * go into a new folder; with it they're added to the end of that folder, as long as
 * the folder stays within MAX_IMPORT_CARDS.
 */
function ImportFolderDialog({
  open, folderNames, into, onClose, onImported,
}: {
  open: boolean; folderNames: string[];
  /** Add to this folder, which has `count` cards, instead of making a new one. */
  into?: { folder: Folder; count: number };
  onClose: () => void; onImported: (f: Folder) => void;
}) {
  const [state, setState] = useState<ImportState>({ step: "pick" });
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  useResetOnOpen(open, () => { setState({ step: "pick" }); setName(""); setErrors([]); });

  const busy = state.step === "importing";
  // Whether the file's cards would take the folder past the limit; rejected before anything is sent.
  const tooMany = (adding: number) => (into && into.count + adding > MAX_IMPORT_CARDS ? overLimitMessage(into.folder.name, into.count, adding) : null);

  const readFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setErrors([]);
    if (file.size > MAX_FILE_BYTES) {
      setState({ step: "pick" });
      setErrors([`The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`]);
      return;
    }
    const parsed = parseFolderFile(await file.text(), file.name);
    if (!parsed.ok) {
      setState({ step: "pick" });
      setErrors(parsed.errors);
      return;
    }
    const over = tooMany(parsed.cards.length);
    if (over) {
      setState({ step: "pick" });
      setErrors([over]);
      return;
    }
    setName(uniqueFolderName(parsed.name, folderNames));
    setState({ step: "ready", fileName: file.name, cards: parsed.cards });
  };

  const runImport = async (e: FormEvent) => {
    e.preventDefault();
    if (state.step !== "ready") return;
    const { cards } = state;
    const total = cards.length;
    setErrors([]);

    let folder: Folder;
    if (into) {
      const over = tooMany(total);
      if (over) { setState({ step: "pick" }); setErrors([over]); return; }
      folder = into.folder;
    } else {
      try {
        folder = await api<Folder>("/api/folders", "POST", { name: name.trim() });
      } catch (err) {
        const msg = (err as Error).message;
        setErrors([msg === "folder exists" ? "You already have a folder with that name. Choose another name." : msg]);
        return;
      }
    }

    let done = 0;
    setState({ step: "importing", done, total });
    try {
      for (const batch of chunk(cards, IMPORT_BATCH_SIZE)) {
        await withRetries(() => api("/api/flashcards/batch", "POST", { folderId: folder._id, cards: batch }));
        done += batch.length;
        setState({ step: "importing", done, total });
      }
      setState({ step: "done", name: folder.name, total });
    } catch (err) {
      setState({ step: "failed", name: folder.name, done, total, message: (err as Error).message });
    }
    // Show the folder, with whatever cards made it in.
    onImported(folder);
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={into ? `Import cards into “${into.folder.name}”` : "Import folder"}>
      {state.step === "importing" || state.step === "done" || state.step === "failed" ? (
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium">
              {state.step === "importing" ? "Importing cards…" : state.step === "done" ? "Import finished" : "Import stopped"}
            </span>
            <span className="tabular-nums text-muted">{state.step === "done" ? state.total : state.done} / {state.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${state.step === "failed" ? "bg-bad" : "bg-good"}`}
              style={{ width: `${((state.step === "done" ? state.total : state.done) / state.total) * 100}%` }}
            />
          </div>
          <div className="mt-4 min-h-10">
            {state.step === "done" && (
              <Notice tone="good">Added {state.total} card{state.total === 1 ? "" : "s"} to “{state.name}”.</Notice>
            )}
            {state.step === "failed" && (
              <Notice>
                Added {state.done} of {state.total} cards to “{state.name}”, then stopped: {state.message}
              </Notice>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={onClose} disabled={busy}>{busy ? "Importing…" : "Close"}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={runImport}>
          <p className="mb-4 text-sm text-muted">
            {into ? (
              <>
                Choose a <code>.json</code> folder file, such as one made with Export. Its cards are added after the{" "}
                {into.count} already here. A folder can reach {MAX_IMPORT_CARDS} cards this way,{" "}
                {into.count < MAX_IMPORT_CARDS
                  ? `so this file can add up to ${MAX_IMPORT_CARDS - into.count}.`
                  : "so this folder is full. Import the file as a new folder instead."}{" "}
                See <code>folderDetails.md</code> for the format.
              </>
            ) : (
              <>
                Choose a <code>.json</code> folder file, such as one made with Export. It becomes a new folder with up
                to {MAX_IMPORT_CARDS} cards. See <code>folderDetails.md</code> for the format.
              </>
            )}
          </p>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]); }}
            className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition ${
              dragging ? "border-info bg-info/5" : "border-line hover:border-muted"
            }`}
          >
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            <span className="font-medium">{state.step === "ready" ? state.fileName : "Drop a folder file here"}</span>
            <span className="mt-1 text-sm text-muted">
              {state.step === "ready"
                ? `${state.cards.length} card${state.cards.length === 1 ? "" : "s"} · click to choose a different file`
                : "or click to choose one"}
            </span>
          </label>

          {state.step === "ready" && (into ? (
            <p className="mt-4 text-sm">
              Adds {state.cards.length} card{state.cards.length === 1 ? "" : "s"}, for {into.count + state.cards.length} in
              this folder.
            </p>
          ) : (
            <div className="mt-4">
              <Field label="Folder name">
                <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
              </Field>
            </div>
          ))}

          {errors.length > 0 && (
            <div className="mt-4">
              <Notice>
                {errors.length === 1 ? errors[0] : (
                  <span className="block">
                    The file can&apos;t be imported:
                    {errors.map((m) => <span key={m} className="mt-1 block">{m}</span>)}
                  </span>
                )}
              </Notice>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-6">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={state.step !== "ready" || (!into && !name.trim())}>Import</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function RenameDialog({
  open, folder, onClose, onSaved,
}: { open: boolean; folder?: Folder; onClose: () => void; onSaved: (f: Folder) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useResetOnOpen(open, () => { setName(folder?.name ?? ""); setError(null); });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!folder) return;
    try {
      onSaved(await api<Folder>(`/api/folders/${folder._id}`, "PATCH", { name: name.trim() }));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Rename folder">
      <form onSubmit={save} className="space-y-4">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button>Rename</Button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDialog({
  open, title, body, action, onClose, onConfirm,
}: {
  open: boolean; title: string; body: string; action: string;
  onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useResetOnOpen(open, () => setError(null));

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-muted">{body}</p>
      {error && <div className="mt-4"><Notice>{error}</Notice></div>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          className="bg-bad text-white hover:opacity-90"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await onConfirm(); onClose(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }}
        >
          {action}
        </Button>
      </div>
    </Modal>
  );
}
