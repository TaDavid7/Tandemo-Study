"use client";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { getSocket, getUsername, RoomPlayer, RoomState, useRequireAuth, VersusSettings } from "@/lib/api";
import { Button, Chip, Notice, Panel, inputClass } from "@/components/ui";

// Same range the server accepts (MIN_SECONDS/MAX_SECONDS in backend/sockets/versus.js).
const MIN_SECONDS = 5;
const MAX_SECONDS = 60;
// Quick picks next to the seconds box.
const TIME_PRESETS = [10, 20, 30, 60];
// Matches the settings a new room starts with on the server.
const DEFAULT_SETTINGS: VersusSettings = { mode: "first", seconds: 20 };

export default function VersusRoomPage() {
  const signedIn = useRequireAuth();
  const router = useRouter();
  const code = String(useParams<{ code: string }>()?.code || "").toUpperCase();

  const [socketId, setSocketId] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [guess, setGuess] = useState("");
  const [wrong, setWrong] = useState(false);
  // Timed mode: when the current question closes, on this device's clock.
  const [deadline, setDeadline] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Which question the guess box belongs to. The guess only clears when this changes,
  // not on every update (someone else scoring used to wipe what you were typing).
  const questionKey = useRef("");

  useEffect(() => {
    if (!signedIn) return;
    const socket = getSocket();
    socketRef.current = socket;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each event has its own payload type
    const handlers: Record<string, (...args: any[]) => void> = {
      connect: () => setSocketId(socket.id || ""),
      disconnect: () => setSocketId(""),
      roomState: (raw: RoomState) => {
        // A server that predates game modes sends no settings/solvedBy/answer; fill them in
        // so the page still renders instead of crashing on room.settings.mode.
        const rs: RoomState = {
          ...raw,
          settings: raw.settings ?? DEFAULT_SETTINGS,
          solvedBy: raw.solvedBy ?? [],
          remainingMs: raw.remainingMs ?? null,
          answer: raw.answer ?? null,
        };
        const key = rs.started ? `${rs.currentIndex}:${rs.currentQuestion?.id}` : "";
        if (key !== questionKey.current) {
          questionKey.current = key;
          setGuess("");
          setWrong(false);
        }
        setDeadline(rs.remainingMs != null ? Date.now() + rs.remainingMs : null);
        setRoom(rs);
        setError(null);
      },
      guessResult: (r: { correct: boolean }) => setWrong(!r.correct),
      error: (e: { message?: string }) => setError(e?.message || "Something went wrong."),
      roomClosed: () => { setClosed(true); setTimeout(() => router.push("/versus"), 2000); },
    };
    Object.entries(handlers).forEach(([e, h]) => socket.on(e, h));

    const join = () => {
      setSocketId(socket.id || "");
      socket.emit("joinRoom", { code, username: getUsername() || "Player" });
      setConnecting(false);
    };
    if (socket.connected) join();
    else socket.once("connect", join);

    return () => { Object.entries(handlers).forEach(([e, h]) => socket.off(e, h)); };
  }, [signedIn, code, router]);

  const emit = (event: string, extra = {}) => socketRef.current?.emit(event, { code, ...extra });
  const isHost = !!room && !!socketId && room.hostId === socketId;
  const players = useMemo(() => [...(room?.players ?? [])].sort((a, b) => b.score - a.score), [room]);

  const question = room?.started ? room.currentQuestion : null;
  const answer = room?.answer ?? null;
  const timed = room?.settings.mode === "timed";
  const solved = !!room && room.solvedBy.includes(socketId);
  const locked = answer !== null || solved;

  // Back to the guess box whenever a new question opens.
  useEffect(() => {
    if (!locked) inputRef.current?.focus();
  }, [locked, room?.currentIndex]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (guess.trim() && !locked) emit("submitGuess", { guess });
  };

  const status = (() => {
    if (!room) return "";
    if (solved) return timed && answer === null ? "Correct! Waiting for the others…" : "Correct! Point is yours.";
    if (answer !== null) {
      const first = room.players.find((p) => p.socketId === room.solvedBy[0]);
      if (timed) return `${room.solvedBy.length} of ${room.players.length} got it.`;
      return first ? `${first.username} got it first.` : "Nobody got this one.";
    }
    return wrong ? "Not quite. Try again." : "";
  })();

  if (!signedIn) return null;

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4 mobile:mb-6 mobile:flex-col mobile:items-stretch">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mobile:text-3xl">Versus</h1>
          <p className="mt-1.5 text-muted">
            Room <span className="font-semibold tracking-widest text-ink">{code}</span>
            <span className="mx-2">·</span>
            {room?.finished ? "Finished" : room?.started ? "Live" : "Waiting in lobby"}
            {isHost && <span className="ml-2 rounded bg-hl px-1.5 py-0.5 text-xs font-semibold text-hl-ink">You&apos;re hosting</span>}
          </p>
        </div>
        {isHost && (room?.started || room?.finished) && (
          <Button variant="danger" onClick={() => emit("exitGame")}>Close room</Button>
        )}
      </div>

      {closed && <div className="mb-6"><Notice>The host closed the room. Taking you back to Versus…</Notice></div>}
      {error && <div className="mb-6"><Notice>{error}</Notice></div>}

      <div className="grid grid-cols-[1fr_17.5rem] gap-8 mobile:grid-cols-1 mobile:gap-6">
        <div className="min-w-0">
          {room?.finished ? (
            <Results room={room} isHost={isHost} onPlayAgain={() => emit("startGame")} onDone={() => router.push("/versus")} />
          ) : room && question ? (
            <>
              <div className="index-card relative flex h-[17.5rem] flex-col overflow-hidden rounded-xl border border-line mobile:h-[15rem] shadow-[0_12px_30px_-12px_rgb(0_0_0/0.25)]">
                {timed && deadline !== null && <TimeBar deadline={deadline} total={room.settings.seconds * 1000} />}
                <div className="flex items-center justify-between px-7 pt-5 text-sm text-muted">
                  <span>Question {room.currentIndex + 1} of {room.totalQuestions}</span>
                  {timed && deadline !== null && <Countdown deadline={deadline} />}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={question.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="flex flex-1 items-center justify-center whitespace-pre-wrap break-words px-10 pb-10 text-center font-card text-3xl leading-snug mobile:px-6 mobile:text-2xl"
                  >
                    {question.question}
                  </motion.p>
                </AnimatePresence>
                <AnimatePresence>
                  {answer !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-x-6 bottom-5 rounded-lg bg-hl px-4 py-2 text-center text-hl-ink"
                    >
                      Answer: <span className="whitespace-pre-wrap font-semibold">{answer || "—"}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <form onSubmit={submit} className="mt-6 flex gap-2">
                <input
                  ref={inputRef}
                  autoFocus
                  value={guess}
                  onChange={(e) => { setGuess(e.target.value); setWrong(false); }}
                  disabled={locked}
                  placeholder="Type your answer and press Enter"
                  className={`${inputClass} h-12 text-lg ${solved ? "border-good" : wrong ? "border-bad" : ""}`}
                />
                <Button size="lg" disabled={!guess.trim() || locked}>Guess</Button>
              </form>
              <p className={`mt-2 h-5 text-sm ${solved ? "text-good" : wrong && answer === null ? "text-bad" : "text-muted"}`}>{status}</p>

              {isHost && (
                <div className="mt-6 flex gap-2">
                  <Button variant="secondary" onClick={() => emit("nextQuestion")}>
                    {answer === null ? "Skip question" : "Next question"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <Panel className="flex h-[17.5rem] flex-col items-center justify-center px-4 text-center">
                <p className="text-muted">Share this code with the people you&apos;re playing</p>
                <p className="my-3 font-card text-7xl tracking-[0.2em] mobile:text-5xl">{code}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                >
                  {copied ? "Copied" : "Copy code"}
                </Button>
                <div className="mt-6">
                  {isHost ? (
                    <Button size="lg" disabled={connecting || players.length < 1} onClick={() => emit("startGame")}>
                      {connecting ? "Connecting…" : "Start game"}
                    </Button>
                  ) : (
                    <p className="text-sm text-muted">The host will start the game when everyone&apos;s in.</p>
                  )}
                </div>
              </Panel>
              {room && (
                <GameSettings settings={room.settings} canEdit={isHost} onChange={(s) => emit("updateSettings", s)} />
              )}
            </>
          )}
        </div>

        <Scoreboard players={players} hostId={room?.hostId} me={socketId} solvedBy={question ? room?.solvedBy ?? [] : []} />
      </div>
    </div>
  );
}

const MODES: { id: VersusSettings["mode"]; title: string; body: string }[] = [
  { id: "first", title: "First to answer", body: "The first correct answer takes the point, then everyone moves on." },
  { id: "timed", title: "Timed rounds", body: "Everyone gets the same time on each question. Every correct answer scores." },
];

/** Game mode picker in the lobby. Only the host can change it; everyone else sees what's set. */
function GameSettings({
  settings,
  canEdit,
  onChange,
}: {
  settings: VersusSettings;
  canEdit: boolean;
  onChange: (s: Partial<VersusSettings>) => void;
}) {
  return (
    <Panel className="mt-6 p-6 mobile:p-5">
      <h2 className="text-sm font-medium text-muted">Game mode{!canEdit && " · set by the host"}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 mobile:grid-cols-1">
        {MODES.map((m) => {
          const active = settings.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              disabled={!canEdit}
              onClick={() => onChange({ mode: m.id })}
              className={`rounded-lg border p-4 text-left transition ${
                active ? "border-hl bg-hl/15" : "border-line hover:border-muted"
              } ${!canEdit && !active ? "opacity-50" : ""} disabled:cursor-default disabled:hover:border-line`}
            >
              <span className="font-semibold">{m.title}</span>
              <span className="mt-1 block text-sm text-muted">{m.body}</span>
            </button>
          );
        })}
      </div>
      {settings.mode === "timed" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted">Time per question</span>
          <SecondsInput seconds={settings.seconds} disabled={!canEdit} onChange={(s) => onChange({ seconds: s })} />
          {canEdit && TIME_PRESETS.map((s) => (
            <Chip
              key={s}
              active={settings.seconds === s}
              onClick={() => onChange({ seconds: s })}
            >
              {s}s
            </Chip>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Seconds box for timed mode. Sends on Enter or when it loses focus, kept within MIN_SECONDS–MAX_SECONDS. */
function SecondsInput({ seconds, disabled, onChange }: { seconds: number; disabled: boolean; onChange: (s: number) => void }) {
  const [draft, setDraft] = useState(String(seconds));
  // Follow the room's value when it changes (a preset was picked, or the host is someone else).
  useEffect(() => setDraft(String(seconds)), [seconds]);

  const commit = () => {
    const n = Math.round(Number(draft));
    if (!draft.trim() || !Number.isFinite(n)) { setDraft(String(seconds)); return; }
    const s = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, n));
    setDraft(String(s));
    if (s !== seconds) onChange(s);
  };

  return (
    <label className="flex items-center gap-1.5 text-sm text-muted">
      <input
        type="number"
        inputMode="numeric"
        min={MIN_SECONDS}
        max={MAX_SECONDS}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={`Seconds per question, ${MIN_SECONDS} to ${MAX_SECONDS}`}
        className="h-9 w-20 rounded-lg border border-line bg-desk/60 px-2 text-center text-base text-ink tabular-nums outline-none transition focus:border-info focus:bg-card"
      />
      <span>sec{!disabled && ` (${MIN_SECONDS}–${MAX_SECONDS})`}</span>
    </label>
  );
}

/** Seconds left on the current question. */
function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, deadline - now);
  return (
    <span className={`font-semibold tabular-nums ${left <= 5000 ? "text-bad" : "text-ink"}`}>
      {Math.ceil(left / 1000)}s
    </span>
  );
}

/** Highlighter bar along the top of the card that runs down with the clock. */
function TimeBar({ deadline, total }: { deadline: number; total: number }) {
  const left = Math.max(0, deadline - Date.now());
  return (
    <motion.div
      key={deadline}
      className="absolute inset-x-0 top-0 h-1 origin-left bg-hl"
      initial={{ scaleX: Math.min(1, left / total) }}
      animate={{ scaleX: 0 }}
      transition={{ duration: left / 1000, ease: "linear" }}
    />
  );
}

function Scoreboard({ players, hostId, me, solvedBy }: { players: RoomPlayer[]; hostId?: string; me: string; solvedBy: string[] }) {
  return (
    <aside>
      <h2 className="mb-3 text-sm font-medium text-muted">Players ({players.length})</h2>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {players.map((p, i) => (
            <motion.li
              key={p.socketId}
              layout
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                i === 0 && p.score > 0 ? "border-hl bg-hl/15" : "border-line bg-card"
              }`}
            >
              <span className="w-4 text-sm tabular-nums text-muted">{i + 1}</span>
              <span className="flex-1 truncate font-medium">
                {p.username}
                {p.socketId === me && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                {p.socketId === hostId && <span className="ml-1.5 text-xs text-muted">host</span>}
              </span>
              {solvedBy.includes(p.socketId) && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-good" aria-label="Answered">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
              <motion.span key={p.score} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="text-lg font-bold tabular-nums">
                {p.score}
              </motion.span>
            </motion.li>
          ))}
        </AnimatePresence>
        {!players.length && <li className="text-sm text-muted">Waiting for players…</li>}
      </ul>
    </aside>
  );
}

function Results({ room, isHost, onPlayAgain, onDone }: { room: RoomState; isHost: boolean; onPlayAgain: () => void; onDone: () => void }) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Panel className="p-10 text-center mobile:px-6">
        <p className="text-muted">Game over</p>
        <h2 className="mt-2 font-card text-5xl mobile:text-4xl">
          <span className="bg-[linear-gradient(transparent_80%,var(--hl)_80%)] px-1">{ranked[0]?.username ?? "Nobody"} wins</span>
        </h2>
        <p className="mt-3 text-muted">with {ranked[0]?.score ?? 0} point{ranked[0]?.score === 1 ? "" : "s"}</p>
        <div className="mt-8 flex justify-center gap-2 mobile:flex-col">
          {isHost && <Button size="lg" onClick={onPlayAgain}>Play again</Button>}
          <Button size="lg" variant={isHost ? "secondary" : "primary"} onClick={onDone}>Back to Versus</Button>
        </div>
      </Panel>
    </motion.div>
  );
}
