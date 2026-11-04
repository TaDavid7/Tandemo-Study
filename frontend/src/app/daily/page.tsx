"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { api, Card, Folder, shuffle, useFolders, useRequireAuth } from "@/lib/api";
import { Button, Chip, FlipCard, Kbd, Notice, PageHeader, Panel } from "@/components/ui";

export default function DailyPage() {
  const signedIn = useRequireAuth();
  const { folders, setFolders, loading } = useFolders();
  const [started, setStarted] = useState(false);

  if (!signedIn) return null;
  if (started) return <Session onExit={() => setStarted(false)} />;

  const toggle = async (f: Folder) => {
    const next = !f.schedule;
    setFolders((all) => all.map((x) => (x._id === f._id ? { ...x, schedule: next } : x)));
    try {
      await api(`/api/folders/${f._id}`, "PATCH", { schedule: next });
    } catch {
      setFolders((all) => all.map((x) => (x._id === f._id ? { ...x, schedule: !next } : x)));
    }
  };

  const included = folders.filter((f) => f.schedule).length;
  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Daily practice"
        sub="Review the cards you're about to forget. Pick which folders count toward your daily session."
      />

      <Panel className="p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold">Folders in your session</h2>
          <span className="text-sm text-muted">{included} of {folders.length} included</span>
        </div>
        {!loading && !folders.length ? (
          <p className="text-muted">
            You don&apos;t have any folders yet. <Link href="/home" className="text-ink underline underline-offset-4">Create one in Decks</Link>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sorted.map((f) => (
              <Chip key={f._id} active={!!f.schedule} onClick={() => toggle(f)}>
                {f.name}
              </Chip>
            ))}
          </div>
        )}
      </Panel>

      <Button size="lg" className="mt-6 w-full" disabled={!included} onClick={() => setStarted(true)}>
        {included ? "Start today's session" : "Include at least one folder"}
      </Button>
    </div>
  );
}

const GRADES = [
  { value: 0, label: "Again", hint: "Forgot", color: "text-bad border-bad/40 hover:bg-bad/10" },
  { value: 1, label: "Hard", hint: "Barely", color: "text-warn border-warn/40 hover:bg-warn/10" },
  { value: 2, label: "Good", hint: "Got it", color: "text-good border-good/40 hover:bg-good/10" },
  { value: 3, label: "Easy", hint: "Instantly", color: "text-info border-info/40 hover:bg-info/10" },
] as const;

// Like Anki's relearning step: a card graded Again comes back after this many
// other cards (or right away if nothing else is left).
const RETRY_GAP = 3;

function Session({ onExit }: { onExit: () => void }) {
  const [queue, setQueue] = useState<Card[]>([]);
  const [retry, setRetry] = useState<{ card: Card; wait: number }[]>([]);
  const [current, setCurrent] = useState<Card | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [turn, setTurn] = useState(0);
  const [cardCount, setCardCount] = useState(0);
  // Going through cards that aren't due. Nothing is sent to the server, so the schedule stays put.
  const [practice, setPractice] = useState(false);
  // Cards already sent to the server this session; their repeats are practice only.
  const graded = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const deal = useCallback((cards: Card[]) => {
    setQueue(cards);
    setCurrent(cards[0] ?? null);
    setTotal(cards.length);
    setDone(0);
  }, []);

  useEffect(() => {
    // tz lets the server count "today" in the user's timezone, not its own
    api<{ review?: Card[]; news?: Card[]; cardCount?: number }>(`/api/daily?tz=${new Date().getTimezoneOffset()}`)
      .then(({ review = [], news = [], cardCount = 0 }) => {
        deal(shuffle([...review, ...news]));
        setCardCount(cardCount);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [deal]);

  const startPractice = async () => {
    setError(null);
    try {
      const { cards } = await api<{ cards: Card[] }>("/api/daily/practice");
      setPractice(true);
      deal(cards);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const grade = useCallback(
    async (value: number) => {
      if (!current || !flipped) return;
      const repeat = graded.current.has(current._id);
      const rest = queue.filter((c) => c._id !== current._id);
      const q = retry.filter((x) => x.card._id !== current._id).map((x) => ({ ...x, wait: x.wait - 1 }));
      if (value === 0) q.push({ card: current, wait: RETRY_GAP });
      const fresh = rest[0] ?? null;
      const due = q.find((x) => x.wait <= 0) ?? (fresh ? undefined : q[0]);
      setQueue(rest);
      setRetry(q);
      setCurrent(due ? due.card : fresh);
      setFlipped(false);
      setTurn((t) => t + 1);
      if (value !== 0) setDone((d) => d + 1);
      if (repeat || practice) return;
      graded.current.add(current._id);
      try {
        await api("/api/review", "POST", { cardId: current._id, grade: value });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [current, flipped, queue, retry, practice]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
      const n = Number(e.key);
      if (n >= 1 && n <= 4) grade(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade]);

  if (loading) return <p className="py-24 text-center text-muted">Getting today&apos;s cards…</p>;

  if (!current) {
    const cardWord = `card${done === 1 ? "" : "s"}`;
    const summary = practice
      ? `You practiced ${done} ${cardWord}. `
      : done
        ? `You reviewed ${done} ${cardWord}. `
        : "Nothing is due right now. ";
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto max-w-lg py-16 text-center"
      >
        <h1 className="font-card text-5xl">
          <span className="bg-[linear-gradient(transparent_80%,var(--hl)_80%)] px-1">
            {cardCount ? "All caught up" : "No cards yet"}
          </span>
        </h1>
        <p className="mt-4 text-muted">
          {cardCount
            ? `${summary}Cards come back here when they're due, or you can practice them now. Practice doesn't change their schedule.`
            : "The folders in your session don't have any cards. Add some in Decks to get started."}
        </p>
        {error && <div className="mt-4"><Notice>{error}</Notice></div>}
        <div className="mt-8 flex justify-center gap-2">
          <Button variant="secondary" onClick={onExit}>Back to folders</Button>
          {cardCount > 0 && <Button onClick={startPractice}>{practice ? "Practice again" : "Practice anyway"}</Button>}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto max-w-[42.5rem]">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onExit}>← End session</Button>
        <span className="text-sm tabular-nums text-muted">
          {done} of {total} {practice ? "practiced" : "reviewed"}{retry.length > 0 && ` · ${retry.length} to retry`}
        </span>
      </div>

      <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-line">
        <motion.div className="h-full rounded-full bg-hl" animate={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      {error && <div className="mb-4"><Notice>{error}</Notice></div>}

      <div className="relative h-[22.5rem] mobile:h-[18rem]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${current._id}-${turn}`}
            className="absolute inset-0"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, rotate: -4 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
          >
            <FlipCard ruled className="h-full" front={current.question} back={current.answer} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-8 h-20 mobile:mt-6 mobile:h-[8.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          {flipped ? (
            <motion.div
              key="grades"
              className="grid grid-cols-4 gap-3 mobile:grid-cols-2 mobile:gap-2"
              initial="hide"
              animate="show"
              exit="hide"
              variants={{ show: { transition: { staggerChildren: 0.04 } } }}
            >
              {GRADES.map((g, i) => (
                <motion.button
                  key={g.value}
                  variants={{ hide: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  onClick={() => grade(g.value)}
                  className={`flex h-16 flex-col items-center justify-center rounded-lg border bg-card transition-[color,background-color,border-color,scale] active:scale-95 ${g.color}`}
                >
                  <span className="font-semibold">{g.label}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <span className="mobile:hidden"><Kbd>{i + 1}</Kbd></span> {g.hint}
                  </span>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <motion.div key="show" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center">
              <Button size="lg" className="w-64" onClick={() => setFlipped(true)}>
                Show answer <span className="mobile:hidden"><Kbd>Space</Kbd></span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
