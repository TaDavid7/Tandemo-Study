"use client";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { getToken, useClientValue } from "@/lib/api";
import { EASE_OUT, FitText, FlipCard, Kbd, Swipeable, inputClass } from "@/components/ui";

const SAMPLES: DemoCard[] = [
  { q: "なんでも (nandemo)", a: "Anything, whatever it is" },
  { q: "Mitochondria", a: "Where the cell makes most of its energy (ATP)" },
  { q: "Year the Berlin Wall fell", a: "1989" },
  { q: "d/dx sin x", a: "cos x" },
];

const MODES = [
  { name: "Decks", href: "/home", text: "Write cards by hand or turn a PDF of your notes into a full deck." },
  { name: "Daily", href: "/daily", text: "Spaced repetition picks the cards you're about to forget, every day." },
  { name: "Speedrun", href: "/speedrun", text: "Type answers against the clock. The deck reshuffles until time's up." },
  { name: "Versus", href: "/versus", text: "Share a room code and race friends to the right answer." },
];

const STEPS: { tab: string; title: string; body: string; Picture: React.ComponentType }[] = [
  {
    tab: "Decks",
    title: "Bring your notes",
    body: "Upload a PDF of your notes and AI writes question-and-answer cards into a folder. Or write cards yourself, one at a time.",
    Picture: NotesPicture,
  },
  {
    tab: "Decks",
    title: "Flip through a deck",
    body: "Study at your own pace. The arrow keys move through the deck and Space flips the card. Fix any card from the list below it.",
    Picture: DeckPicture,
  },
  {
    tab: "Daily",
    title: "Review what's due each day",
    body: "Grade each card Again, Hard, Good or Easy. Cards you know come back less often. Cards you miss come back tomorrow.",
    Picture: DailyPicture,
  },
  {
    tab: "Speedrun",
    title: "Race the clock",
    body: "Type as many answers as you can before time runs out. The deck reshuffles when you reach the end, and you get a list of what you missed.",
    Picture: SpeedrunPicture,
  },
  {
    tab: "Versus",
    title: "Or race your friends",
    body: "Create a room and share its 6-character code. Everyone gets the same question, and the first right answer takes the point.",
    Picture: VersusPicture,
  },
];

export default function LandingPage() {
  const router = useRouter();
  // null until hydrated. Signed-in visitors go straight to their decks.
  const signedIn = useClientValue(() => getToken() !== null, null);
  const ready = signedIn === false;

  useEffect(() => {
    if (signedIn) router.replace("/home");
  }, [signedIn, router]);

  useSmoothScroll(ready);

  if (!ready) return null;

  return (
    <>
      <Hero />
      <HowItWorks />
      <Memory />
      <Modes />
      <Closing />
    </>
  );
}

/**
 * Lenis eases wheel and trackpad scrolling on this page, and smooth-scrolls in-page
 * links like "See how it works". It still moves the real window scroll, so useScroll,
 * useInView and sticky elements keep working. Off when the system asks for reduced motion.
 */
function useSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Anchors land using the target's scroll-margin (scroll-mt-24 clears the sticky header).
    const lenis = new Lenis({ autoRaf: true, lerp: 0.09, anchors: true });
    return () => lenis.destroy();
  }, [enabled]);
}

/* ── Sections ───────────────────────────────────────────── */

/**
 * Props for text that eases up into place the first time it scrolls into view.
 * Spread onto any motion element; stagger related lines with `delay`.
 */
const reveal = (delay = 0) => ({
  initial: { opacity: 0, transform: "translateY(14px)" },
  whileInView: { opacity: 1, transform: "translateY(0px)" },
  viewport: { once: true, margin: "0px 0px -60px 0px" },
  transition: { duration: 0.6, ease: EASE_OUT, delay },
});

type DemoCard = { q: string; a: string };
/** Which way the demo deck last moved, and whether a swipe did it. */
type Move = { dir: number; swipe: boolean };

// Cards written on the landing page are kept short and few; they only live on this page.
const DEMO_MAX_CHARS = 120;
/** Most cards the demo deck holds, the samples included. */
const DEMO_MAX_CARDS = 10;

/**
 * The hero's deck of sample cards. It flips and deals itself until you touch it; from
 * then on it's yours: click to flip, drag sideways or use the arrows to move, and write
 * your own cards into it.
 */
function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [deck, setDeck] = useState<DemoCard[]>(SAMPLES);
  const [pos, setPos] = useState<{ i: number; move: Move }>({ i: 0, move: { dir: 1, swipe: false } });
  const [flipped, setFlipped] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [writing, setWriting] = useState(false);
  const card = deck[pos.i];
  const groupRef = useRef<HTMLDivElement>(null);
  // Set when the arrow keys move the deck: the focused card is replaced, so focus moves
  // to the new one and Space keeps flipping.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    groupRef.current?.querySelector<HTMLElement>(`[data-card="${pos.i}"] .flip-card-inner`)?.focus({ preventScroll: true });
  }, [pos.i]);

  // As the hero scrolls away the card stack drifts up and tilts, and the cue fades.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const drift = useTransform(scrollYProgress, (v) => (reduce ? "none" : `translateY(${v * -90}px) rotate(${v * -6}deg)`));
  const cueOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  // Until you touch it, the demo card flips, then moves to the next sample.
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => {
      if (!flipped) setFlipped(true);
      else {
        setFlipped(false);
        setPos((p) => ({ i: (p.i + 1) % SAMPLES.length, move: { dir: 1, swipe: false } }));
      }
    }, flipped ? 2200 : 1800);
    return () => clearTimeout(id);
  }, [flipped, autoplay]);

  const go = (dir: 1 | -1, swipe = false) => {
    setAutoplay(false);
    setFlipped(false);
    setPos((p) => ({ i: (p.i + dir + deck.length) % deck.length, move: { dir, swipe } }));
  };
  const flip = () => {
    setAutoplay(false);
    setFlipped((f) => !f);
  };
  const add = (c: DemoCard) => {
    if (deck.length >= DEMO_MAX_CARDS) return;
    setDeck((d) => [...d, c]);
    setPos({ i: deck.length, move: { dir: 1, swipe: false } });
    setFlipped(false);
  };

  return (
    <section ref={ref} className="relative flex min-h-[calc(100svh-7rem)] flex-col">
      <div className="grid flex-1 items-center gap-16 pt-6 lg:grid-cols-[1.05fr_1fr] mobile:grid-cols-1 mobile:gap-10 mobile:pt-2">
        <div>
          <h1 className="text-5xl font-bold leading-[1.02] tracking-tight lg:text-6xl mobile:text-4xl">
            <motion.span className="block" {...reveal()}>Study anything.</motion.span>
            <motion.span className="block" {...reveal(0.08)}>Remember it next week.</motion.span>
          </h1>
          <motion.p className="mt-6 max-w-md text-lg text-muted" {...reveal(0.16)}>
            Tandemo turns your notes into flashcards and schedules each review right before you&apos;d forget it.
          </motion.p>
          <motion.div {...reveal(0.24)}>
            <SignUpLinks className="mt-9" />
          </motion.div>
        </div>

        <div
          ref={groupRef}
          role="group"
          aria-label="Sample flashcards"
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).tagName === "INPUT") return;
            const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            refocus.current = (e.target as HTMLElement).classList.contains("flip-card-inner");
            go(dir);
          }}
        >
          <motion.div style={{ transform: drift }}>
            <motion.div
              initial={{ opacity: 0, rotate: 4, y: 30 }}
              animate={{ opacity: 1, rotate: -2, y: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 16 }}
              className="relative h-[20rem] mobile:h-[15rem]"
            >
              <div className="absolute inset-0 translate-x-4 translate-y-4 rotate-3 rounded-xl border border-line bg-card/60" />
              <div className="absolute inset-0 translate-x-2 translate-y-2 rotate-1 rounded-xl border border-line bg-card/80" />
              {/* The finished card slides off (still showing its answer) while the next one slides in. */}
              <AnimatePresence mode="popLayout" custom={pos.move} initial={false}>
                <motion.div
                  key={pos.i}
                  data-card={pos.i}
                  custom={pos.move}
                  className="absolute inset-0"
                  variants={{
                    enter: ({ dir }: Move) => ({ opacity: 0, transform: `translateX(${dir * 40}px) rotate(0deg)` }),
                    center: { opacity: 1, transform: "translateX(0px) rotate(0deg)" },
                    // A swiped card is already flying off under the pointer (see Swipeable), so it only fades.
                    exit: ({ dir, swipe }: Move) =>
                      swipe
                        ? { opacity: 0, transition: { duration: 0.25, ease: EASE_OUT } }
                        : { opacity: 0, transform: `translateX(${dir * -60}px) rotate(${dir * -4}deg)` },
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                >
                  <Swipeable enabled onSwipe={(step) => go(step, true)}>
                    <FlipCard className="h-full" front={card.q} back={card.a} flipped={flipped} onFlip={flip} />
                  </Swipeable>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </motion.div>

          <div className="mt-9 flex items-center justify-center gap-4">
            <DeckArrow dir={-1} onClick={() => go(-1)} />
            <span className="min-w-14 text-center text-sm font-medium tabular-nums">
              {pos.i + 1} / {deck.length}
            </span>
            <DeckArrow dir={1} onClick={() => go(1)} />
          </div>
          <p className="mt-3 text-center text-sm text-muted">
            Click the card to flip it. Drag it sideways or use the arrows for the next one.
          </p>
          <div className="mt-5 flex justify-center">
            {writing ? (
              <WriteCardForm onAdd={add} left={DEMO_MAX_CARDS - deck.length} onClose={() => setWriting(false)} />
            ) : (
              <button
                onClick={() => { setAutoplay(false); setWriting(true); }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium underline-offset-4 transition hover:bg-ink/5"
              >
                + Write your own card
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lenis turns this anchor into a smooth scroll */}
      <motion.a
        href="#how"
        style={{ opacity: cueOpacity }}
        className="mx-auto mt-12 flex flex-col items-center gap-1 pb-2 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        See how it works
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.a>
    </section>
  );
}

function DeckArrow({ dir, onClick }: { dir: 1 | -1; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 1 ? "Next card" : "Previous card"}
      className="grid h-10 w-10 place-items-center rounded-full border border-line bg-card text-muted transition hover:border-muted hover:text-ink active:scale-90"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d={dir === 1 ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * Adds a card to the hero's demo deck, which holds DEMO_MAX_CARDS. `left` is how many
 * more fit. Nothing is saved; that needs an account.
 */
function WriteCardForm({ onAdd, left, onClose }: { onAdd: (c: DemoCard) => void; left: number; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const full = left <= 0;
  const field = `${inputClass} h-10 text-sm disabled:opacity-50`;

  return (
    <motion.form
      initial={{ opacity: 0, transform: "translateY(6px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      onSubmit={(e) => {
        e.preventDefault();
        if (full) return;
        onAdd({ q: q.trim(), a: a.trim() });
        setQ("");
        setA("");
      }}
      className="w-full max-w-md"
    >
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mobile:grid-cols-1">
        <input autoFocus disabled={full} value={q} onChange={(e) => setQ(e.target.value)} maxLength={DEMO_MAX_CHARS} required placeholder="Question" aria-label="Question" className={field} />
        <input disabled={full} value={a} onChange={(e) => setA(e.target.value)} maxLength={DEMO_MAX_CHARS} required placeholder="Answer" aria-label="Answer" className={field} />
        <button disabled={full || !q.trim() || !a.trim()} className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-card transition hover:opacity-90 disabled:opacity-40">
          Add
        </button>
      </div>
      {full ? (
        <p role="status" className="mt-2 flex justify-between gap-4 rounded-lg bg-hl/15 px-3 py-2 text-xs">
          <span>
            The demo deck is full at {DEMO_MAX_CARDS} cards.{" "}
            <Link href="/account?mode=signup" className="font-semibold underline underline-offset-2">Make a free account</Link>{" "}
            to write as many as you like.
          </span>
          <button type="button" onClick={onClose} className="shrink-0 text-muted hover:text-ink">Done</button>
        </p>
      ) : (
        <p className="mt-2 flex justify-between gap-4 text-xs text-muted">
          <span>
            Room for {left} more card{left === 1 ? "" : "s"}. Cards you write here aren&apos;t saved; make an account to keep them.
          </span>
          <button type="button" onClick={onClose} className="shrink-0 hover:text-ink">Done</button>
        </p>
      )}
    </motion.form>
  );
}

/**
 * Walkthrough, top to bottom. Each step sits beside its own picture of the app, with a
 * white index card between steps as a pause. On narrow screens the picture goes under
 * the text.
 */
function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 pt-24">
      <SectionHeading kicker="How it works" title="From a pile of notes to cards you remember." />
      {STEPS.map((s, k) => (
        <React.Fragment key={s.title}>
          <Step step={s} index={k} />
          {INTERLUDES[k] && <Interlude {...INTERLUDES[k]} />}
        </React.Fragment>
      ))}
    </section>
  );
}

/* ── Interludes ─────────────────────────────────────────── */
// Quiet breaks between the walkthrough steps: a white index card with a small drawing
// that isn't a screen of the app, and one line of text. They give the eye somewhere
// to rest before the next picture.

const TONES = {
  hl: { dot: "bg-hl" },
  good: { dot: "bg-good" },
};

type Tone = keyof typeof TONES;

type ArtProps = { tone: Tone };

// Keyed by the step each card follows: after step 1 and after step 3.
const INTERLUDES: Record<number, { tone: Tone; line: string; Art: React.ComponentType<ArtProps> }> = {
  0: { tone: "hl", line: "Your notes, rewritten as questions.", Art: ScatteredCards },
  2: { tone: "good", line: "A few minutes a day, spaced out instead of crammed.", Art: SpacedDots },
};

/**
 * A breather between two steps: a white index card (white in dark mode too) that rises
 * into place when it comes into view. Its drawing drifts a little slower than the page
 * as you scroll past, which keeps it calm.
 */
function Interlude({ tone, line, Art }: (typeof INTERLUDES)[number]) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const drift = useTransform(scrollYProgress, (v) => (reduce ? "none" : `translateY(${(0.5 - v) * 30}px)`));

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "shown" : "hidden"}
      variants={{
        hidden: { opacity: 0, transform: "translateY(32px)" },
        shown: { opacity: 1, transform: "translateY(0px)", transition: { duration: 0.8, ease: EASE_OUT } },
      }}
      className="paper index-card relative mx-auto my-12 flex max-w-2xl flex-col rounded-2xl border border-line pb-14 text-center text-ink shadow-[0_1px_0_var(--line),0_30px_60px_-30px_rgb(0_0_0/0.5)]"
    >
      <span className="px-8 pb-10 pt-5 text-left text-sm text-muted">Note</span>
      <motion.div style={{ transform: drift }} className="flex h-28 items-center justify-center">
        <Art tone={tone} />
      </motion.div>
      <motion.p variants={stepRise} custom={0.25} className="mx-auto mt-8 max-w-lg px-6 font-card text-3xl italic leading-snug">
        {line}
      </motion.p>
    </motion.div>
  );
}

/** A handful of blank cards settling onto the desk. */
function ScatteredCards({ tone }: ArtProps) {
  const cards = [
    { x: -150, y: 10, r: -14 },
    { x: -70, y: -14, r: 6 },
    { x: 10, y: 8, r: -4 },
    { x: 90, y: -10, r: 10 },
    { x: 165, y: 12, r: -8 },
  ];
  return (
    <div className="relative h-full w-full">
      {cards.map((c, k) => (
        <motion.div
          key={k}
          variants={{
            hidden: { opacity: 0, transform: `translate(${c.x}px, ${c.y + 30}px) rotate(0deg)` },
            shown: {
              opacity: 1,
              transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`,
              transition: { duration: 0.8, ease: EASE_OUT, delay: 0.1 + k * 0.08 },
            },
          }}
          className="absolute left-1/2 top-1/2 -ml-10 -mt-7 h-14 w-20 rounded-md border border-line bg-card shadow-sm"
        >
          <span className={`absolute inset-x-2 top-3 h-0.5 rounded-full ${TONES[tone].dot}`} />
          <span className="absolute inset-x-2 top-6 h-0.5 rounded-full bg-ink/10" />
          <span className="absolute left-2 right-6 top-9 h-0.5 rounded-full bg-ink/10" />
        </motion.div>
      ))}
    </div>
  );
}

/** Three weeks of days, with the review days getting further apart. */
function SpacedDots({ tone }: ArtProps) {
  const reviews = new Set([0, 1, 3, 7, 14]);
  return (
    <div className="flex items-center gap-2.5">
      {Array.from({ length: 21 }, (_, day) => (
        <motion.span
          key={day}
          variants={{
            hidden: { opacity: 0, transform: "scale(0.6)" },
            shown: { opacity: 1, transform: "scale(1)", transition: { duration: 0.4, ease: EASE_OUT, delay: 0.1 + day * 0.035 } },
          }}
          className={`rounded-full ${reviews.has(day) ? `h-4 w-4 ${TONES[tone].dot}` : "h-2 w-2 bg-ink/15"}`}
        />
      ))}
    </div>
  );
}

// Text lines rise in one after another; `custom` is each line's delay.
const stepRise = {
  hidden: { opacity: 0, transform: "translateY(14px)" },
  shown: (delay: number) => ({ opacity: 1, transform: "translateY(0px)", transition: { duration: 0.6, ease: EASE_OUT, delay } }),
};
const pictureRise = {
  hidden: { opacity: 0, transform: "translateY(24px)" },
  shown: { opacity: 1, transform: "translateY(0px)", transition: { duration: 0.7, ease: EASE_OUT, delay: 0.1 } },
};

/**
 * One step of the walkthrough. useInView (an IntersectionObserver) waits until a third
 * of the step is on screen. Until then the picture isn't mounted at all, so later
 * pictures can't be seen early and their own animations start when you reach them.
 */
function Step({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "shown" : "hidden"}
      className="grid items-center gap-10 py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 mobile:grid-cols-1 mobile:gap-8 mobile:py-12"
    >
      <div>
        <motion.p variants={stepRise} custom={0} className="text-sm font-medium tabular-nums text-muted">
          0{index + 1} · {step.tab}
        </motion.p>
        <motion.h3 variants={stepRise} custom={0.06} className="mt-2 text-3xl font-bold tracking-tight">
          {step.title}
        </motion.h3>
        <motion.p variants={stepRise} custom={0.12} className="mt-3 max-w-md text-lg text-muted">
          {step.body}
        </motion.p>
      </div>
      <motion.div variants={pictureRise}>
        <AppWindow tab={step.tab}>{inView && <step.Picture />}</AppWindow>
      </motion.div>
    </motion.div>
  );
}

/** The forgetting curve, drawn as you scroll down to it. */
function Memory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const draw = useTransform(scrollYProgress, [0.25, 1], [0, 1]);
  const lineOpacity = useTransform(draw, [0, 0.02], [0, 1]);
  const fadeOpacity = useTransform(scrollYProgress, [0.25, 0.6], [0, 1]);

  return (
    <section className="grid items-center gap-16 py-32 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] mobile:grid-cols-1 mobile:gap-10 mobile:py-20">
      <div>
        <SectionHeading kicker="Spaced repetition" title="Each review lands right before you'd forget." />
        <motion.p className="mt-2 max-w-md text-lg text-muted" {...reveal(0.12)}>
          Every card keeps its own schedule. Remember it, and the next review moves further out: tomorrow, then in six days,
          then a couple of weeks. Miss it, and it comes back tomorrow.
        </motion.p>
        <motion.p className="mt-4 max-w-md text-lg text-muted" {...reveal(0.18)}>
          Daily practice only shows what&apos;s due, with at most 200 reviews a day and 20 new cards per folder.
        </motion.p>
      </div>

      <div ref={ref} className="relative rounded-xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="font-semibold">Chance you remember one card</p>
          <div className="flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded-full bg-ink" /> With reviews
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 border-t-2 border-dashed border-muted" /> Without
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-hl ring-2 ring-card" /> Review in Daily
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${CHART.w} ${CHART.h}`}
          className="mt-4 w-full"
          role="img"
          aria-label={`Recall of one card over ${CHART_DAYS} days. Without reviews it fades to almost nothing within a week. With reviews on days ${CURVE.reviews
            .map((r) => r.day)
            .join(", ")}, it never drops much below 60%, and the gap between reviews keeps growing.`}
        >
          {[1, 0.5, 0].map((r) => (
            <g key={r}>
              <line x1={CHART.left} x2={CHART.w - CHART.right} y1={cyRecall(r)} y2={cyRecall(r)} strokeWidth={1} className="stroke-line" />
              <text x={CHART.left - 8} y={cyRecall(r)} dy="0.35em" textAnchor="end" className="fill-muted text-[12px]">
                {r * 100}%
              </text>
            </g>
          ))}
          {CURVE.reviews.map((r) => (
            <text key={r.day} x={cxDay(r.day)} y={CHART.h - 8} textAnchor="middle" className="fill-muted text-[12px]">
              Day {r.day}
            </text>
          ))}
          <motion.path
            d={FADE_PATH}
            fill="none"
            strokeWidth={2}
            strokeDasharray="5 6"
            strokeLinecap="round"
            className="stroke-muted"
            style={{ opacity: fadeOpacity }}
          />
          <motion.path
            d={CURVE.path}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-ink"
            style={{ pathLength: draw, opacity: lineOpacity }}
          />
          {CURVE.reviews.map((r) => (
            <ReviewDot key={r.day} progress={draw} at={r.at} x={cxDay(r.day)} y={cyRecall(1)} day={r.day} />
          ))}
        </svg>
      </div>
    </section>
  );
}

function ReviewDot({ progress, at, x, y, day }: { progress: MotionValue<number>; at: number; x: number; y: number; day: number }) {
  const opacity = useTransform(progress, [at - 0.02, at], [0, 1]);
  return (
    <motion.circle cx={x} cy={y} r={5} strokeWidth={2} className="fill-hl stroke-card" style={{ opacity }}>
      <title>Reviewed on day {day}</title>
    </motion.circle>
  );
}

function Modes() {
  return (
    <section>
      <SectionHeading kicker="Four ways to study" title="Pick how you practice today." />
      <div className="mt-10 grid border-t border-line sm:grid-cols-2 lg:grid-cols-4 mobile:grid-cols-1">
        {MODES.map((m, k) => (
          <motion.div
            key={m.name}
            initial={{ opacity: 0, transform: "translateY(8px)" }}
            whileInView={{ opacity: 1, transform: "translateY(0px)" }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.3, ease: EASE_OUT, delay: k * 0.06 }}
            className={k > 0 ? "border-line lg:border-l lg:pl-8 mobile:border-l-0 mobile:pl-0" : ""}
          >
            <Link href={m.href} className="group block py-8 pr-8">
              <ModePicture name={m.name} />
              <h3 className="text-xl font-semibold">
                <span className="bg-[linear-gradient(transparent_80%,var(--hl)_80%)] bg-[length:0%_100%] bg-no-repeat transition-[background-size] duration-300 group-hover:bg-[length:100%_100%]">
                  {m.name}
                </span>
              </h3>
              <p className="mt-2 text-muted">{m.text}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/**
 * A small picture above each mode. It plays once, when at least half of it is on
 * screen: the children pick up the "shown" variant from the frame.
 */
function ModePicture({ name }: { name: string }) {
  return (
    <motion.div
      aria-hidden
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.5 }}
      className="relative mb-6 h-32 overflow-hidden rounded-xl border border-line bg-card"
    >
      {name === "Decks" && <DecksMini />}
      {name === "Daily" && <DailyMini />}
      {name === "Speedrun" && <SpeedrunMini />}
      {name === "Versus" && <VersusMini />}
    </motion.div>
  );
}

const miniEase = (delay: number, duration = 0.5) => ({ duration, ease: EASE_OUT, delay });

/** Three cards that fan out from a neat stack. */
function DecksMini() {
  const fan = [
    { to: "translateX(-34px) rotate(-12deg)", label: "" },
    { to: "translateX(34px) rotate(12deg)", label: "" },
    { to: "translateY(-4px) rotate(0deg)", label: "Q" },
  ];
  return (
    <div className="absolute inset-0 grid place-items-center">
      {fan.map((c, k) => (
        <motion.div
          key={k}
          variants={{
            hidden: { transform: "translateX(0px) rotate(0deg)" },
            shown: { transform: c.to, transition: miniEase(0.1 + k * 0.06, 0.6) },
          }}
          className="col-start-1 row-start-1 grid h-16 w-24 place-items-center rounded-md border border-line bg-desk font-card text-lg shadow-sm"
        >
          {c.label}
        </motion.div>
      ))}
    </div>
  );
}

/** The four grade buttons popping in one after another, with Good picked. */
function DailyMini() {
  const grades = [
    { label: "Again", cls: "border-bad/40 text-bad" },
    { label: "Hard", cls: "border-warn/40 text-warn" },
    { label: "Good", cls: "border-good bg-good/10 text-good" },
    { label: "Easy", cls: "border-info/40 text-info" },
  ];
  return (
    <div className="absolute inset-0 grid grid-cols-4 items-center gap-1.5 px-4">
      {grades.map((g, k) => (
        <motion.span
          key={g.label}
          variants={{
            hidden: { opacity: 0, transform: "translateY(10px)" },
            shown: { opacity: 1, transform: "translateY(0px)", transition: miniEase(0.1 + k * 0.07) },
          }}
          className={`grid h-10 place-items-center rounded-md border text-xs font-semibold ${g.cls}`}
        >
          {g.label}
        </motion.span>
      ))}
    </div>
  );
}

/** The timer bar running down while the seconds show. */
function SpeedrunMini() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-5">
      <div className="flex items-baseline justify-between">
        <span className="font-card text-lg">d/dx sin x</span>
        <span className="text-xl font-bold tabular-nums">0:42</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <motion.div
          variants={{
            hidden: { transform: "translateX(0%)" },
            shown: { transform: "translateX(-30%)", transition: { duration: 1.6, ease: "linear", delay: 0.2 } },
          }}
          className="h-full rounded-full bg-hl"
        />
      </div>
    </div>
  );
}

/** Two players' scores filling in, the leader in highlighter yellow. */
function VersusMini() {
  const players = [
    { name: "You", fill: "-18%", cls: "bg-hl" },
    { name: "Maya", fill: "-42%", cls: "bg-muted/50" },
  ];
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-5">
      {players.map((p, k) => (
        <div key={p.name} className="grid grid-cols-[2.75rem_1fr] items-center gap-2 text-xs font-medium">
          {p.name}
          <div className="h-2.5 overflow-hidden rounded-full bg-line">
            <motion.div
              variants={{
                hidden: { transform: "translateX(-100%)" },
                shown: { transform: `translateX(${p.fill})`, transition: miniEase(0.15 + k * 0.1, 0.8) },
              }}
              className={`h-full rounded-full ${p.cls}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Closing() {
  return (
    <section className="pb-8 pt-32">
      <motion.div
        initial={{ opacity: 0, transform: "translateY(24px) rotate(2deg)" }}
        whileInView={{ opacity: 1, transform: "translateY(0px) rotate(-1deg)" }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="index-card mx-auto flex max-w-3xl flex-col rounded-xl border border-line shadow-[0_1px_0_var(--line),0_30px_60px_-30px_rgb(0_0_0/0.45)]"
      >
        <span className="px-8 pt-5 text-sm text-muted">Question</span>
        <div className="px-10 pb-14 pt-12 text-center mobile:px-6">
          <motion.h2 className="font-card text-5xl leading-tight mobile:text-4xl" {...reveal(0.15)}>What will you learn first?</motion.h2>
          <motion.p className="mx-auto mt-4 max-w-md text-lg text-muted" {...reveal(0.22)}>
            Make a free account, drop in your notes, and start your first deck.
          </motion.p>
          <SignUpLinks className="mt-9 justify-center" />
        </div>
      </motion.div>
      <p className="mt-20 text-center text-sm text-muted">
        Learn something new, every day with Tandemo.
      </p>
    </section>
  );
}

/* ── Pieces ─────────────────────────────────────────────── */

function SignUpLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <Link href="/account?mode=signup" className="inline-flex h-12 items-center rounded-lg bg-ink px-6 font-medium text-card transition hover:opacity-90">
        Create a free account
      </Link>
      <Link href="/account" className="inline-flex h-12 items-center rounded-lg border border-line bg-card px-6 font-medium transition hover:border-muted">
        Sign in
      </Link>
    </div>
  );
}

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <motion.p className="flex items-center gap-2 text-sm font-medium text-muted" {...reveal()}>
        <span className="h-3.5 w-1.5 -skew-x-6 rounded-[2px] bg-hl" />
        {kicker}
      </motion.p>
      <motion.h2 className="mt-3 text-4xl font-bold leading-tight tracking-tight mobile:text-3xl" {...reveal(0.06)}>{title}</motion.h2>
    </div>
  );
}

/* ── Pictures of the app ────────────────────────────────── */
// Small, simplified versions of real screens, drawn with the app's own styles so
// they follow the light and dark themes.

const TABS = ["Decks", "Daily", "Speedrun", "Versus"];

/** App frame: the top bar with one tab lit, and a fixed-height screen below. */
// The pictures are drawn for this width. Narrower than that (phones), the whole
// picture is zoomed down to fit, like an image, instead of squashing its contents.
const PICTURE_WIDTH = 540;

function AppWindow({ tab, children }: { tab: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setZoom(Math.min(1, entry.contentRect.width / PICTURE_WIDTH)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div
        className="overflow-hidden rounded-xl border border-line bg-desk shadow-[0_1px_0_var(--line),0_30px_60px_-30px_rgb(0_0_0/0.45)]"
        style={zoom < 1 ? { width: PICTURE_WIDTH, zoom } : undefined}
      >
        <div className="flex h-11 items-center justify-between border-b border-line px-4">
          <span className="flex items-center gap-2">
            <span lang="ja" className="grid h-5 w-5 -rotate-6 place-items-center rounded bg-hl text-[10px] font-bold text-hl-ink">た</span>
            <span className="text-sm font-semibold tracking-tight">Tandemo</span>
          </span>
          <span className="flex text-xs font-medium">
            {TABS.map((t) => (
              <span key={t} className={`relative px-2.5 py-1.5 ${t === tab ? "text-hl-ink" : "text-muted"}`}>
                {t === tab && (
                  <span className="absolute inset-0.5 -skew-x-6 rounded-[4px] bg-hl" />
                )}
                <span className="relative">{t}</span>
              </span>
            ))}
          </span>
          <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-card">A</span>
        </div>
        <div className="relative h-[400px]">{children}</div>
      </div>
    </div>
  );
}

const faceShadow = "shadow-[0_1px_0_var(--line),0_12px_30px_-12px_rgb(0_0_0/0.25)]";

const DOC_LINES = [92, 84, 96, 0, 88, 95, 72, 0, 90, 80, 64]; // widths in %, 0 is a paragraph break
const DOC_HIGHLIGHTS = new Set([2, 5, 9]);
const NOTE_CARDS = [
  { q: "What does the mitochondria make?", a: "ATP, the cell's energy" },
  { q: "Where does glycolysis happen?", a: "In the cytoplasm" },
  { q: "What is the cell membrane made of?", a: "A phospholipid bilayer" },
];

function NotesPicture() {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] items-center gap-5 p-7">
      <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded bg-bad px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
          <span className="truncate text-xs font-medium">cell-biology.pdf</span>
        </div>
        <div className="mb-3 h-2.5 w-3/5 rounded-full bg-ink/30" />
        <div className="space-y-2">
          {DOC_LINES.map((w, k) =>
            w === 0 ? (
              <div key={k} className="h-1" />
            ) : (
              <div key={k} className={`h-1.5 rounded-full ${DOC_HIGHLIGHTS.has(k) ? "bg-hl" : "bg-ink/15"}`} style={{ width: `${w}%` }} />
            )
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-muted">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-medium">AI</span>
      </div>

      <div className="space-y-2.5">
        {NOTE_CARDS.map((c, k) => (
          <motion.div
            key={c.q}
            initial={{ opacity: 0, transform: "translateX(-10px)" }}
            whileInView={{ opacity: 1, transform: "translateX(0px)" }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.2 + k * 0.08 }}
            className="rounded-lg border border-line bg-card px-3.5 py-2.5 shadow-sm"
          >
            <p className="font-card text-[15px] leading-snug">{c.q}</p>
            <p className="mt-0.5 text-xs text-muted">{c.a}</p>
          </motion.div>
        ))}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.5 }}
          className="rounded-md bg-good/10 px-2.5 py-1.5 text-xs text-good"
        >
          Added 18 cards to this folder.
        </motion.p>
      </div>
    </div>
  );
}

// The two cards in the deck picture's list.
const DECK_CARDS = NOTE_CARDS.slice(0, 2);

/** Flips by itself until you click: the card flips, the list picks a card, ← → move. */
function DeckPicture() {
  const [k, setK] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => setFlipped((f) => !f), flipped ? 2200 : 1400);
    return () => clearTimeout(id);
  }, [flipped, autoplay]);

  const open = (n: number) => {
    setAutoplay(false);
    setK((n + DECK_CARDS.length) % DECK_CARDS.length);
    setFlipped(false);
  };
  const flip = () => {
    setAutoplay(false);
    setFlipped((f) => !f);
  };
  const hintKey = "rounded transition hover:-translate-y-px hover:text-ink";

  return (
    <div className="grid h-full grid-cols-[110px_minmax(0,1fr)] gap-5 p-6">
      <div>
        <p className="mb-2 px-2 text-[11px] font-medium text-muted">Folders</p>
        {["Biology", "French", "History"].map((f, n) => (
          <p
            key={f}
            className={`relative truncate rounded-md px-2 py-1.5 text-xs ${n === 0 ? "bg-card font-semibold shadow-sm ring-1 ring-line" : "text-muted"}`}
          >
            {n === 0 && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-hl" />}
            {f}
          </p>
        ))}
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between">
          <p className="text-lg font-bold tracking-tight">Biology</p>
          <p className="text-xs text-muted">18 cards</p>
        </div>
        <FlipCard small className="mt-3 h-[168px]" front={DECK_CARDS[k].q} back={DECK_CARDS[k].a} flipped={flipped} onFlip={flip} />
        <div className="mt-3 flex justify-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <button aria-label="Previous card" onClick={() => open(k - 1)} className={hintKey}><Kbd>←</Kbd></button>
            <button aria-label="Next card" onClick={() => open(k + 1)} className={hintKey}><Kbd>→</Kbd></button>
            move
          </span>
          <button onClick={flip} className={`flex items-center gap-1 ${hintKey}`}><Kbd>Space</Kbd> flip</button>
        </div>
        <div className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-card text-xs">
          {DECK_CARDS.map((c, n) => (
            <button
              key={c.q}
              onClick={() => open(n)}
              className={`grid w-full grid-cols-[1rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition-colors ${
                n === k ? "bg-ink/[0.04] shadow-[inset_3px_0_var(--hl)]" : "hover:bg-ink/[0.03]"
              }`}
            >
              <span className="tabular-nums text-muted">{n + 1}</span>
              <span className="truncate font-medium">{c.q}</span>
              <span className="truncate text-muted">{c.a}</span>
              <span className="text-muted">Edit</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const GRADES = [
  { label: "Again", hint: "Forgot", cls: "border-bad/40 bg-card text-bad hover:bg-bad/10", note: "bg-bad/10 text-bad" },
  { label: "Hard", hint: "Barely", cls: "border-warn/40 bg-card text-warn hover:bg-warn/10", note: "bg-warn/10 text-warn" },
  { label: "Good", hint: "Got it", cls: "border-good/40 bg-card text-good hover:bg-good/10", note: "bg-good/10 text-good" },
  { label: "Easy", hint: "Instantly", cls: "border-info/40 bg-card text-info hover:bg-info/10", note: "bg-info/10 text-info" },
];
const GOOD = 2;

// Cards part-way through their schedule, so each grade sends them back after a different gap.
const DAILY_CARDS = [
  { q: "ありがとう", a: "Thank you", ease: 2.5, interval: 6, reps: 2 },
  { q: "Capital of Canada", a: "Ottawa", ease: 2.5, interval: 1, reps: 1 },
  { q: "Largest planet in the solar system", a: "Jupiter", ease: 2.3, interval: 15, reps: 3 },
];
const DAILY_TOTAL = 20;

/** Days until a card comes back after `grade` (0 Again … 3 Easy), by the rules in backend/lib/schedule.js. */
function daysUntilNext(card: (typeof DAILY_CARDS)[number], grade: number) {
  if (grade === 0 || card.reps === 0) return 1;
  if (card.reps === 1) return 6;
  const ease = Math.min(3, Math.max(1.3, card.ease + [-0.2, -0.15, 0, 0.15][grade]));
  return Math.max(1, Math.round(card.interval * ease));
}

/** Show the answer, then grade it: the card says when it will come back. Plays itself until clicked. */
function DailyPicture() {
  const [n, setN] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(7);
  const [note, setNote] = useState<{ id: number; grade: number; text: string } | null>(null);
  const [autoplay, setAutoplay] = useState(true);
  const card = DAILY_CARDS[n % DAILY_CARDS.length];

  const grade = (g: number) => {
    const days = daysUntilNext(card, g);
    setNote({ id: n, grade: g, text: `${GRADES[g].label}: back ${days === 1 ? "tomorrow" : `in ${days} days`}` });
    setReviewed((r) => (r + 1 > DAILY_TOTAL ? 1 : r + 1));
    setN((k) => k + 1);
    setFlipped(false);
  };

  // Until you click, it shows the answer, then grades the card Good.
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => (flipped ? grade(GOOD) : setFlipped(true)), flipped ? 1800 : 1600);
    return () => clearTimeout(id);
  });

  // Any click takes over from the demo.
  const take = (fn: () => void) => () => { setAutoplay(false); fn(); };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>← End session</span>
        <span className="tabular-nums">{reviewed} of {DAILY_TOTAL} reviewed</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-hl transition-[width] duration-300" style={{ width: `${(reviewed / DAILY_TOTAL) * 100}%` }} />
      </div>

      <div className="relative mt-5 min-h-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={n}
            className="absolute inset-0"
            initial={{ opacity: 0, transform: "translateY(16px) scale(0.97)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: "translateY(-24px) rotate(-3deg)" }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <FlipCard small className="h-full" front={card.q} back={card.a} flipped={flipped} onFlip={take(() => setFlipped((f) => !f))} />
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {note && (
            <motion.span
              key={note.id}
              initial={{ opacity: 0, transform: "translateY(-4px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className={`pointer-events-none absolute right-3 top-3 z-10 rounded-md px-2 py-1 text-[11px] font-medium ${GRADES[note.grade].note}`}
            >
              {note.text}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 h-14">
        {flipped ? (
          <div className="grid h-full grid-cols-4 gap-2">
            {GRADES.map((g, k) => (
              <motion.button
                key={g.label}
                initial={{ opacity: 0, transform: "translateY(8px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.2, ease: EASE_OUT, delay: k * 0.04 }}
                onClick={take(() => grade(k))}
                className={`flex flex-col items-center justify-center rounded-lg border text-sm transition-colors ${g.cls}`}
              >
                <span className="font-semibold">{g.label}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                  <Kbd>{k + 1}</Kbd> {g.hint}
                </span>
              </motion.button>
            ))}
          </div>
        ) : (
          <button
            onClick={take(() => setFlipped(true))}
            className="flex h-full w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-medium text-card transition hover:opacity-90"
          >
            Show answer <Kbd>Space</Kbd>
          </button>
        )}
      </div>
    </div>
  );
}

const RUN = [
  { q: "d/dx sin x", a: "cos x" },
  { q: "Capital of Australia", a: "Canberra" },
  { q: "Chemical symbol for gold", a: "Au" },
];

// Case and spaces don't matter when checking a typed answer here.
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Types its own answers until you click the box. Then you type, and Enter checks. */
function SpeedrunPicture() {
  const [left, setLeft] = useState(42);
  const [n, setN] = useState(0);
  const [typed, setTyped] = useState(0); // letters the demo has typed so far
  const [guess, setGuess] = useState<string | null>(null); // null while the demo types by itself
  const [right, setRight] = useState(12);
  const [missed, setMissed] = useState(2);
  const [answer, setAnswer] = useState<string | null>(null); // shown after a wrong guess
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const card = RUN[n % RUN.length];
  const demo = guess === null;
  const done = demo && typed === card.a.length;
  const urgent = left <= 10;

  useEffect(() => {
    const id = setInterval(() => setLeft((t) => (t > 1 ? t - 1 : 60)), 1000);
    return () => clearInterval(id);
  }, []);

  const next = () => {
    setN((k) => k + 1);
    setTyped(0);
    setAnswer(null);
    setFlash(null);
    setGuess((g) => (g === null ? null : ""));
  };

  // The demo types the answer a letter at a time, holds it a moment, then goes on.
  useEffect(() => {
    if (!demo) return;
    const id = setTimeout(() => {
      if (done) { setRight((r) => r + 1); setN((k) => k + 1); setTyped(0); }
      else setTyped((k) => k + 1);
    }, done ? 650 : 120);
    return () => clearTimeout(id);
  }, [typed, done, demo]);

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (demo) { setGuess(""); inputRef.current?.focus(); return; }
    if (answer !== null || flash || !guess?.trim()) return;
    if (squash(guess) === squash(card.a)) {
      setRight((r) => r + 1);
      setFlash("good");
      setTimeout(next, 500);
    } else {
      setMissed((m) => m + 1);
      setAnswer(card.a);
      setFlash("bad");
      setTimeout(next, 1300);
    }
  };

  // Memoized: FitText refits whenever its children change.
  const cardText = React.useMemo(
    () => (
      <>
        {card.q}
        {answer !== null && <span className="block text-bad">Answer: {answer}</span>}
      </>
    ),
    [card.q, answer]
  );

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Finish early</span>
        <span className="flex gap-4 tabular-nums">
          <span className="text-good">{right} correct</span>
          <span className="text-bad">{missed} missed</span>
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full transition-[translate,background-color] duration-1000 ease-linear ${urgent ? "bg-bad" : "bg-hl"}`}
            style={{ translate: `${(left / 60 - 1) * 100}% 0` }}
          />
        </div>
        <span className={`w-10 text-right text-2xl font-bold tabular-nums ${urgent ? "text-bad" : ""}`}>{left}</span>
      </div>

      <div
        className={`index-card mt-6 flex h-[160px] flex-col rounded-xl border px-8 pt-5 text-center transition-colors ${faceShadow} ${
          flash === "bad" ? "border-bad" : flash === "good" ? "border-good" : "border-line"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={n}
            initial={{ opacity: 0, transform: "translateY(12px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: "translateY(-12px)" }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <FitText ruled className="pb-2 font-card text-2xl">{cardText}</FitText>
          </motion.div>
        </AnimatePresence>
      </div>

      <form onSubmit={check} className="mt-5 flex gap-2">
        <input
          ref={inputRef}
          value={demo ? card.a.slice(0, typed) : guess}
          onFocus={() => { if (demo) setGuess(""); }}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Type the answer and press Enter"
          aria-label="Your answer"
          className={`h-11 min-w-0 flex-1 rounded-lg border bg-card px-3 outline-none transition-colors ${
            flash === "good" || done ? "border-good" : flash === "bad" ? "border-bad" : "border-info"
          }`}
        />
        <button className="inline-flex h-11 items-center rounded-lg bg-ink px-5 text-sm font-medium text-card transition hover:opacity-90">
          Check
        </button>
      </form>
      <p className="mt-2.5 text-[11px] text-muted">{demo ? "Click the box to try it yourself." : "Your turn. Spaces and capitals don't matter."}</p>
    </div>
  );
}

const PLAYERS = [
  { name: "Maya", score: 5 },
  { name: "You", score: 4 },
  { name: "Kenji", score: 3 },
  { name: "Sam", score: 1 },
];
// Who answers first in each round, so the order keeps changing.
const ROUND_WINNERS = ["You", "You", "Kenji", "Maya", "You", "Sam", "Kenji", "Kenji"];

/** Reveals and moves on by itself until you use the two buttons. */
function VersusPicture() {
  const [round, setRound] = useState(0);
  const [shown, setShown] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => {
      if (!shown) setShown(true);
      else { setShown(false); setRound((r) => r + 1); }
    }, shown ? 1100 : 900);
    return () => clearTimeout(id);
  }, [shown, autoplay]);

  const q = RUN[round % RUN.length];
  const ranked = PLAYERS.map((p) => ({
    ...p,
    score: p.score + Array.from({ length: round }, (_, k) => ROUND_WINNERS[k % ROUND_WINNERS.length]).filter((w) => w === p.name).length,
  })).sort((a, b) => b.score - a.score);

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_170px] gap-5 p-6">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Room <span className="ml-1 font-card text-sm tracking-[0.2em] text-ink">K7QM2X</span>
          </span>
          <span className="tabular-nums">Question {round + 1}</span>
        </div>
        <div className={`index-card relative mt-3 flex flex-1 flex-col rounded-xl border border-line ${faceShadow}`}>
          <span className="px-5 pt-5 text-sm text-muted">Question</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={round}
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transform: "translateY(-12px)" }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <FitText ruled className="px-6 pb-14 text-center font-card text-2xl">{q.q}</FitText>
            </motion.div>
          </AnimatePresence>
          <AnimatePresence>
            {shown && (
              <motion.div
                initial={{ opacity: 0, transform: "translateY(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className="absolute inset-x-4 bottom-4 rounded-lg bg-hl px-3 py-1.5 text-center text-sm text-hl-ink"
              >
                Answer: <span className="font-semibold">{q.a}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-4 flex gap-2 text-sm font-medium">
          <button
            onClick={() => { setAutoplay(false); setShown((s) => !s); }}
            className="inline-flex h-9 items-center rounded-lg border border-line bg-card px-3 transition hover:border-muted"
          >
            {shown ? "Hide answer" : "Reveal answer"}
          </button>
          <button
            onClick={() => { setAutoplay(false); setShown(false); setRound((r) => r + 1); }}
            className="inline-flex h-9 items-center rounded-lg bg-ink px-3 text-card transition hover:opacity-90"
          >
            Next question
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Players ({PLAYERS.length})</p>
        <ul className="space-y-2">
          {ranked.map((p, k) => (
            <motion.li
              key={p.name}
              layout
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${k === 0 ? "border-hl bg-hl/15" : "border-line bg-card"}`}
            >
              <span className="w-3 text-xs tabular-nums text-muted">{k + 1}</span>
              <span className="flex-1 truncate font-medium">{p.name}</span>
              <motion.span
                key={p.score}
                initial={{ transform: "scale(1.4)" }}
                animate={{ transform: "scale(1)" }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="font-bold tabular-nums"
              >
                {p.score}
              </motion.span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Forgetting curve ───────────────────────────────────── */
// Review days for a card graded "Good" every time under backend/lib/schedule.js:
// first after 1 day, then 6, then interval × ease (2.5). Each review is timed for
// when recall has dropped to about 60%.

const CHART_DAYS = 40;
const CHART = { w: 560, h: 250, left: 48, right: 12, top: 14, bottom: 32 };
const REVIEW_DAYS = [1, 7, 22, 60];
const RECALL_AT_REVIEW = 0.6;

const cxDay = (day: number) => CHART.left + (day / CHART_DAYS) * (CHART.w - CHART.left - CHART.right);
const cyRecall = (r: number) => CHART.top + (1 - r) * (CHART.h - CHART.top - CHART.bottom);
const toPath = (pts: [number, number][]) => pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

/** The sawtooth "with reviews" line, plus where along its length each review happens (0–1). */
const CURVE = (() => {
  const pts: [number, number][] = [];
  const marks: { day: number; index: number }[] = [];
  let start = 0;
  for (const next of REVIEW_DAYS) {
    const stability = (next - start) / -Math.log(RECALL_AT_REVIEW);
    const end = Math.min(next, CHART_DAYS);
    for (let k = start ? 1 : 0; k <= 32; k++) {
      const t = start + ((end - start) * k) / 32;
      pts.push([cxDay(t), cyRecall(Math.exp(-(t - start) / stability))]);
    }
    if (next > CHART_DAYS) break;
    pts.push([cxDay(next), cyRecall(1)]); // the review brings recall back up
    marks.push({ day: next, index: pts.length - 1 });
    start = next;
  }

  const lengths = [0];
  for (let k = 1; k < pts.length; k++) {
    lengths.push(lengths[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  return { path: toPath(pts), reviews: marks.map((m) => ({ day: m.day, at: lengths[m.index] / total })) };
})();

/** The same card never reviewed after day 0. */
const FADE_PATH = toPath(
  Array.from({ length: 161 }, (_, k): [number, number] => {
    const t = (k / 160) * CHART_DAYS;
    return [cxDay(t), cyRecall(Math.exp(-t / (REVIEW_DAYS[0] / -Math.log(RECALL_AT_REVIEW))))];
  })
);
