"use client";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { api, authfetch, Card, Folder, useCards, useFolders, useRequireAuth } from "@/lib/api";
import { Button, EASE_OUT, Field, FlipCard, Kbd, Modal, Notice, Panel, inputClass } from "@/components/ui";
import { useMobile } from "@/components/AppShell";

/** Which way the deck last moved, and whether a swipe did it. */
type Move = { dir: number; swipe: boolean };

type Dialog =
  | { kind: "card"; card?: Card }
  | { kind: "pdf" }
  | { kind: "rename" }
  | { kind: "deleteFolder" }
  | { kind: "deleteCard"; card: Card }
  | null;

export default function DecksPage() {
  const signedIn = useRequireAuth();
  const { folders, setFolders, loading: foldersLoading } = useFolders();
  const [folderId, setFolderId] = useState("");
  const { cards, setCards, reload } = useCards(folderId);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<Move>({ dir: 1, swipe: false });
  const [flipped, setFlipped] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const mobile = useMobile();
  // Set while a swipe is in progress, so letting go doesn't also count as a tap-to-flip.
  const swiping = useRef(false);

  const folder = folders.find((f) => f._id === folderId);

  // Remember the last folder and open it again next time.
  useEffect(() => {
    if (!folders.length || folderId) return;
    const saved = localStorage.getItem("lastFolder");
    setFolderId(folders.some((f) => f._id === saved) ? saved! : folders[0]._id);
  }, [folders, folderId]);

  useEffect(() => {
    if (folderId) localStorage.setItem("lastFolder", folderId);
    setIndex(0);
    setFlipped(false);
  }, [folderId]);

  const go = (step: number, swipe = false) => {
    if (!cards.length) return;
    setDirection({ dir: step, swipe });
    setFlipped(false);
    setIndex((i) => (i + step + cards.length) % cards.length);
  };

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
        onCreated={(f) => { setFolders((all) => [...all, f]); setFolderId(f._id); }}
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
                  <button onClick={() => setDialog({ kind: "deleteFolder" })} className="ml-3 underline-offset-4 hover:text-bad hover:underline">Delete</button>
                </p>
              </div>
              <div className="flex shrink-0 gap-2 mobile:grid mobile:grid-cols-2">
                <Button variant="secondary" onClick={() => setDialog({ kind: "pdf" })}>Import from PDF</Button>
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
                      >
                        <Swipeable enabled={mobile} swiping={swiping} onSwipe={(step) => go(step, true)}>
                          <FlipCard
                            className="h-full"
                            front={current.question}
                            back={current.answer}
                            flipped={flipped}
                            onFlip={() => { if (!swiping.current) setFlipped((f) => !f); }}
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
                  currentId={current._id}
                  onOpen={(i) => { setDirection({ dir: i > index ? 1 : -1, swipe: false }); setIndex(i); setFlipped(false); }}
                  onEdit={(card) => setDialog({ kind: "card", card })}
                  onDelete={(card) => setDialog({ kind: "deleteCard", card })}
                />
              </>
            ) : (
              <EmptyState
                title="This folder is empty"
                body="Add cards one at a time, or import a PDF of your notes and cards will be written for you."
              >
                <div className="mt-6 flex justify-center gap-2">
                  <Button variant="secondary" onClick={() => setDialog({ kind: "pdf" })}>Import from PDF</Button>
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
          if (isNew) { setDirection({ dir: 1, swipe: false }); setIndex(cards.length); setFlipped(false); }
        }}
      />
      <PdfDialog open={dialog?.kind === "pdf"} folderId={folderId} onClose={() => setDialog(null)} onImported={reload} />
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
          setIndex((i) => Math.max(0, Math.min(i, cards.length - 2)));
        }}
      />
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────── */

function FolderSidebar({
  folders, loading, selected, onSelect, onCreated,
}: {
  folders: Folder[]; loading: boolean; selected: string;
  onSelect: (id: string) => void; onCreated: (f: Folder) => void;
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
    </aside>
  );
}

// A swipe counts once the card would end up this far from centre, counting a flick's speed.
const SWIPE_DISTANCE = 90;
const FLICK_SECONDS = 0.2;

/** Phone: the card follows your finger sideways. Swipe left for the next card, right for the previous one. */
function Swipeable({
  enabled,
  swiping,
  onSwipe,
  children,
}: {
  enabled: boolean;
  swiping: React.RefObject<boolean>;
  onSwipe: (step: 1 | -1) => void;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  // Tilts a little as it moves, like a card held at the bottom edge.
  const rotate = useTransform(x, [-300, 300], [-8, 8]);

  return (
    <motion.div
      className="h-full"
      style={{ x, rotate }}
      drag={enabled ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={1} // follows the finger 1:1
      dragTransition={{ bounceStiffness: 500, bounceDamping: 34 }} // springs back when you don't swipe far enough
      onDragStart={() => { swiping.current = true; }}
      onDragEnd={(_, { offset, velocity }) => {
        const landing = offset.x + velocity.x * FLICK_SECONDS;
        const step = landing < -SWIPE_DISTANCE ? 1 : landing > SWIPE_DISTANCE ? -1 : 0;
        if (step) {
          // Keep going off-screen at the speed it was thrown, instead of springing back first.
          animate(x, step * -window.innerWidth, { type: "spring", velocity: velocity.x, stiffness: 220, damping: 30 });
          onSwipe(step);
        }
        setTimeout(() => { swiping.current = false; }, 0);
      }}
    >
      {children}
    </motion.div>
  );
}

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

function CardList({
  cards, currentId, onOpen, onEdit, onDelete,
}: {
  cards: Card[]; currentId: string;
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
                className={`group grid grid-cols-[2.5rem_1fr_1fr_auto] items-center gap-4 px-4 py-3 transition-[background-color,box-shadow] mobile:grid-cols-[1.25rem_minmax(0,1fr)_auto] mobile:gap-x-3 mobile:gap-y-0.5 mobile:px-3 ${
                  c._id === currentId ? "bg-ink/[0.04] shadow-[inset_3px_0_var(--hl)]" : "hover:bg-ink/[0.03]"
                }`}
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
}

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
const MAX_WORDS = 100;
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

function WordCount({ text }: { text: string }) {
  const n = countWords(text);
  return (
    <span className={`block text-right text-xs tabular-nums ${n > MAX_WORDS ? "text-bad" : "text-muted"}`}>
      {n} / {MAX_WORDS} words
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
  const tooLong = countWords(q) > MAX_WORDS || countWords(a) > MAX_WORDS;

  return (
    <Modal open={open} onClose={onClose} title={card ? "Edit card" : "Add card"}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Question">
          <textarea ref={questionRef} autoFocus rows={3} value={q} onChange={(e) => setQ(e.target.value)} required className={area} />
          <WordCount text={q} />
        </Field>
        <Field label="Answer">
          <textarea rows={3} value={a} onChange={(e) => setA(e.target.value)} required className={area} />
          <WordCount text={a} />
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
