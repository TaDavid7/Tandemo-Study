"use client";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import Link from "next/link";
import { Card, useCards, useFolders, useRequireAuth } from "@/lib/api";
import { Button, Chip, FitText, PageHeader, Panel, inputClass } from "@/components/ui";

const PRESETS = [30, 60, 120, 300];
const MIN_CARDS = 5;

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}`);

export default function SpeedrunPage() {
  const signedIn = useRequireAuth();
  const { folders, loading } = useFolders();
  const [folderId, setFolderId] = useState("");
  const { cards, loading: cardsLoading } = useCards(folderId);
  const [seconds, setSeconds] = useState(60);
  const [custom, setCustom] = useState("");
  const [playing, setPlaying] = useState(false);

  if (!signedIn) return null;

  const time = custom ? Number(custom) : seconds;
  const enoughCards = cards.length >= MIN_CARDS;
  const ready = folderId && enoughCards && time > 0;

  if (playing) return <Game cards={cards} seconds={time} onExit={() => setPlaying(false)} />;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Speedrun" sub="Type as many answers as you can before the clock runs out. The deck reshuffles when you reach the end." />

      <Panel className="divide-y divide-line">
        <div className="p-6">
          <h2 className="mb-4 font-semibold">Folder</h2>
          {!loading && !folders.length ? (
            <p className="text-muted">
              No folders yet. <Link href="/home" className="text-ink underline underline-offset-4">Create one in Decks</Link>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {folders.map((f) => (
                <Chip key={f._id} active={folderId === f._id} onClick={() => setFolderId(f._id)}>{f.name}</Chip>
              ))}
            </div>
          )}
          <p className="mt-3 h-5 text-sm">
            {folderId && !cardsLoading && (enoughCards
              ? <span className="text-good">{cards.length} cards ready</span>
              : <span className="text-bad">This folder has {cards.length} card{cards.length === 1 ? "" : "s"}. Speedrun needs at least {MIN_CARDS}.</span>)}
          </p>
        </div>

        <div className="p-6">
          <h2 className="mb-4 font-semibold">Time limit</h2>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Chip key={p} active={!custom && seconds === p} onClick={() => { setSeconds(p); setCustom(""); }}>
                {p < 60 ? `${p} sec` : `${p / 60} min`}
              </Chip>
            ))}
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
              placeholder="Custom (sec)"
              className={`${inputClass} h-9 w-36 text-sm mobile:text-base ${custom ? "border-hl" : ""}`}
            />
          </div>
        </div>
      </Panel>

      <Button size="lg" className="mt-6 w-full" disabled={!ready} onClick={() => setPlaying(true)}>
        {ready ? `Start · ${fmt(time)}${time < 60 ? " sec" : ""}` : "Pick a folder to start"}
      </Button>
    </div>
  );
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Game({ cards, seconds, onExit }: { cards: Card[]; seconds: number; onExit: () => void }) {
  const [deck, setDeck] = useState(() => shuffle(cards));
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [guess, setGuess] = useState("");
  const [right, setRight] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [missed, setMissed] = useState<Card[]>([]);
  const [reveal, setReveal] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const controls = useAnimationControls();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (over) return;
    const id = setInterval(() => setLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [over]);

  useEffect(() => { if (left === 0) setOver(true); }, [left]);

  const advance = () => {
    setReveal(null);
    setGuess("");
    if (i === deck.length - 1) { setDeck(shuffle(cards)); setI(0); } else setI(i + 1);
    inputRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (over || reveal !== null || !guess.trim()) return;
    const card = deck[i];
    // Collapse whitespace so a multi-line answer can be typed on one line.
    const flat = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
    if (flat(guess) === flat(card.answer)) {
      setRight((n) => n + 1);
      controls.start({ scale: [1, 1.03, 1], transition: { duration: 0.25 } });
      advance();
    } else {
      setWrong((n) => n + 1);
      setMissed((m) => (m.some((c) => c._id === card._id) ? m : [...m, card]));
      setReveal(card.answer);
      controls.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.35 } });
      setTimeout(advance, 1100);
    }
  };

  const restart = () => {
    setDeck(shuffle(cards)); setI(0); setLeft(seconds); setRight(0); setWrong(0);
    setMissed([]); setReveal(null); setGuess(""); setOver(false);
  };

  if (over) {
    const accuracy = right + wrong ? Math.round((right / (right + wrong)) * 100) : 0;
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl">
        <h1 className="font-card text-5xl">Time&apos;s up</h1>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            { label: "Correct", value: right, cls: "text-good" },
            { label: "Missed", value: wrong, cls: "text-bad" },
            { label: "Accuracy", value: `${accuracy}%`, cls: "" },
          ].map((s, k) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + k * 0.08 }}>
              <Panel className="p-5">
                <div className={`text-4xl font-bold tabular-nums ${s.cls}`}>{s.value}</div>
                <div className="mt-1 text-sm text-muted">{s.label}</div>
              </Panel>
            </motion.div>
          ))}
        </div>

        {missed.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 font-semibold">Cards to review</h2>
            <Panel className="divide-y divide-line">
              {missed.map((c) => (
                <div key={c._id} className="grid grid-cols-2 gap-4 px-4 py-3">
                  <span className="whitespace-pre-wrap break-words">{c.question}</span>
                  <span className="whitespace-pre-wrap break-words text-muted">{c.answer}</span>
                </div>
              ))}
            </Panel>
          </div>
        )}

        <div className="mt-8 flex gap-2">
          <Button size="lg" onClick={restart}>Play again</Button>
          <Button size="lg" variant="secondary" onClick={onExit}>Change settings</Button>
        </div>
      </motion.div>
    );
  }

  const pct = (left / seconds) * 100;
  const urgent = left <= 10;

  return (
    <div className="mx-auto max-w-[42.5rem]">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setOver(true)}>Finish early</Button>
        <div className="flex gap-5 text-sm tabular-nums">
          <span className="text-good">{right} correct</span>
          <span className="text-bad">{wrong} missed</span>
        </div>
      </div>

      <div className="mb-8 flex items-center gap-5">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <motion.div
            className={`h-full rounded-full ${urgent ? "bg-bad" : "bg-hl"}`}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: "linear" }}
          />
        </div>
        <motion.span
          key={urgent ? left : "calm"}
          initial={urgent ? { scale: 1.3 } : false}
          animate={{ scale: 1 }}
          className={`w-20 text-right text-3xl font-bold tabular-nums mobile:w-14 mobile:text-2xl ${urgent ? "text-bad" : ""}`}
        >
          {fmt(left)}
        </motion.span>
      </div>

      <motion.div animate={controls}>
        <div
          className={`index-card relative flex h-[16.25rem] flex-col rounded-xl border px-10 py-5 text-center mobile:h-[12rem] mobile:px-6 mobile:pt-12 shadow-[0_12px_30px_-12px_rgb(0_0_0/0.25)] transition-colors ${
            reveal !== null ? "border-bad" : "border-line"
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${deck[i]?._id}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.15 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <FitText className="font-card text-3xl leading-snug">{deck[i]?.question}</FitText>
            </motion.div>
          </AnimatePresence>
          <AnimatePresence>
            {reveal !== null && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-0 bottom-5 text-center text-bad"
              >
                Answer: <span className="whitespace-pre-wrap font-semibold">{reveal}</span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <form onSubmit={submit} className="mt-6 flex gap-2">
        <input
          ref={inputRef}
          autoFocus
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Type the answer and press Enter"
          className={`${inputClass} h-12 text-lg`}
        />
        <Button size="lg">Check</Button>
      </form>
    </div>
  );
}
