// Shared building blocks used by every page.
"use client";
import React, { memo, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Strong ease-out for entrances and exits. Same curve as --ease-out in globals.css. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/* ── Button ───────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-card hover:opacity-90",
  secondary: "bg-card text-ink border border-line hover:border-muted",
  ghost: "text-muted hover:text-ink hover:bg-ink/5",
  danger: "text-bad border border-bad/40 hover:bg-bad/10",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition active:scale-[0.97]",
        "disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variants[variant],
        className
      )}
    />
  );
}

/* ── Layout pieces ────────────────────────────────────── */

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 mobile:mb-6 mobile:flex-col mobile:items-stretch mobile:gap-4">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mobile:text-3xl">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("rounded-xl border border-line bg-card", className)} />;
}

export const inputClass =
  "h-10 w-full rounded-lg border border-line bg-desk/60 px-3 text-base text-ink placeholder:text-muted/70 outline-none transition focus:border-info focus:bg-card";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

/** Toggle chip with a highlighter fill when selected. */
export function Chip({ active, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      aria-pressed={active}
      className={cx(
        "relative h-9 rounded-lg border px-3.5 text-sm font-medium transition",
        active ? "border-hl bg-hl text-hl-ink" : "border-line bg-card text-ink hover:border-muted",
        className
      )}
    />
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-card px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function Notice({ tone = "bad", children }: { tone?: "bad" | "good"; children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cx("rounded-lg px-3 py-2 text-sm", tone === "bad" ? "bg-bad/10 text-bad" : "bg-good/10 text-good")}
    >
      {children}
    </motion.p>
  );
}

/* ── Modal ────────────────────────────────────────────── */
// The fade is plain CSS (.modal-backdrop / .modal-panel in globals.css). Motion's
// opacity animations here could drop to their starting value for a frame when the
// dialog re-rendered, which made it blink while you typed.

const MODAL_CLOSE_MS = 200; // matches the transition in globals.css

/** Renders its children, but stops updating while `frozen`, so it keeps showing the last ones. */
const Frozen = memo(
  function Frozen({ children }: { children: React.ReactNode; frozen: boolean }) {
    return children;
  },
  (_, next) => next.frozen
);

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // Stay mounted while the closing fade plays.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const titleId = useId();
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setMounted(true); setClosing(false); }
    else if (mounted) setClosing(true);
  }

  useEffect(() => {
    if (!closing) return;
    const id = setTimeout(() => { setMounted(false); setClosing(false); }, MODAL_CLOSE_MS);
    return () => clearTimeout(id);
  }, [closing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 mobile:items-end mobile:p-0"
      data-closing={closing ? "" : undefined}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel w-full max-w-lg rounded-xl border border-line bg-card p-6 shadow-2xl mobile:max-w-[30rem] mobile:rounded-b-none mobile:border-b-0 mobile:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* While closing, keep showing what the dialog showed last, so the title or fields
            don't change under the fade (e.g. "Edit card" turning into "Add card"). */}
        <Frozen frozen={closing}>
          <h2 id={titleId} className="mb-5 text-xl font-semibold">{title}</h2>
          {children}
        </Frozen>
      </div>
    </div>
  );
}

/* ── Flip card ────────────────────────────────────────── */
// The index card used for studying everywhere in the app. Its text sits on the
// card's ruled lines (FitText). The turn is a CSS transition (.flip-card in
// globals.css), so it runs on the compositor and reverses from mid-turn if the card
// is flipped again.

export function FlipCard({
  front,
  back,
  flipped,
  onFlip,
  className,
  small,
}: {
  front: React.ReactNode;
  back: React.ReactNode;
  flipped: boolean;
  onFlip?: () => void;
  className?: string;
  /** Smaller side margins and text, for small cards such as the pictures on the landing page. */
  small?: boolean;
}) {
  const face =
    "flip-face index-card absolute inset-0 flex flex-col rounded-xl border border-line shadow-[0_1px_0_var(--line),0_12px_30px_-12px_rgb(0_0_0/0.25)]";
  const body = cx(
    "pb-2 text-center font-card",
    small ? "px-5 text-2xl" : "px-10 text-3xl mobile:px-6 mobile:text-2xl"
  );
  const label = cx("pt-5 text-sm text-muted", small ? "px-5" : "px-7");
  return (
    <div className={cx("flip-card", className)} data-flipped={flipped ? "" : undefined}>
      <button
        type="button"
        onClick={onFlip}
        aria-label={flipped ? "Show question" : "Show answer"}
        className="flip-card-inner relative block h-full w-full cursor-pointer text-left"
      >
        <div className={cx(face, "flip-face-front")}>
          <span className={label}>Question</span>
          <FitText className={body} ruled>{front}</FitText>
        </div>
        <div className={cx(face, "flip-face-back")}>
          <span className={label}>Answer</span>
          <FitText className={body} ruled>{back}</FitText>
        </div>
      </button>
    </div>
  );
}

/* ── Swipe ────────────────────────────────────────────── */

// A swipe counts once the card would end up this far from centre, counting a flick's speed.
const SWIPE_DISTANCE = 90;
const FLICK_SECONDS = 0.2;

/** The card follows your finger (or the mouse) sideways. Swipe left for the next card, right for the previous one. */
export function Swipeable({
  enabled,
  onSwipe,
  children,
}: {
  enabled: boolean;
  onSwipe: (step: 1 | -1) => void;
  children: React.ReactNode;
}) {
  // Set while a swipe is in progress, so letting go doesn't also count as a tap-to-flip.
  const swiping = useRef(false);
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
      // Swallow the click that ends a drag before it reaches the card underneath.
      onClickCapture={(e) => { if (swiping.current) e.stopPropagation(); }}
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

/* ── Fit text ─────────────────────────────────────────── */
// Card text that keeps its line breaks and always fits its box.
//
// `ruled` writes the text on the lines of the surrounding .index-card: one line of
// text per rule, centred in the rows the box covers. Text that needs more lines than
// the card has gets smaller, and the card's rules move closer together to match
// (RULE_SCALES), so the words stay on the lines. Only text too long even for the
// closest rules drops the lines (data-unruled in globals.css) and shrinks freely.
//
// Without `ruled`, the text shrinks until it fits, down to FIT_MIN of the box's font
// size. Anything still too tall scrolls from the first line (m-auto rather than
// justify-center, so the top is never clipped).

const FIT_MIN = 0.5;
const FIT_STEP = 0.05;
const FIT_STEPS = Math.round((1 - FIT_MIN) / FIT_STEP);

// Where .index-card draws its rules, in rem (globals.css): the first rule, and the gap
// between rules. Both are rounded to whole pixels, the same as the CSS.
const RULE_TOP_REM = 3.625;
const RULE_GAP_REM = 2;
// Rule gaps (and text sizes) to try, as a share of the full size, largest first.
const RULE_SCALES = [1, 0.875, 0.75, 0.65, 0.56, 0.5];
// Ruled text is a little smaller than the box's font size, so each line has some room
// between its words and the rule above.
const RULED_TEXT = 0.88;
// Each line of text is one rule gap tall. This moves the words from the middle of the
// line down to just above its rule: 3/8 of a gap below the middle, less the distance
// from the middle of a line to the baseline in Newsreader, the card font (0.235em).
const baselineShift = (gap: number) => `translateY(calc(${(gap * 3) / 8}px - 0.235em))`;

/** The top of `el` measured from the top of `ancestor`. Ignores transforms, so it's right mid-animation. */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    const parent = node.offsetParent as HTMLElement | null;
    top += node.offsetTop;
    // offsetParent jumps over static elements; if it jumped past `ancestor`, measure back down.
    if (parent && parent !== ancestor && !ancestor.contains(parent)) return top - offsetWithin(ancestor, parent);
    node = parent;
  }
  return top;
}

/**
 * Tries to put the text on the card's rules at `scale` of the full size. Sets the
 * card's rule gap to match and returns true if every line of text fits on a rule.
 */
function alignToRules(card: HTMLElement, box: HTMLElement, text: HTMLElement, scale: number) {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const ruleTop = Math.round(RULE_TOP_REM * rem);
  const gap = Math.round(RULE_GAP_REM * rem * scale);
  card.style.setProperty("--rule-gap", `${gap}px`);
  text.style.fontSize = `${scale * RULED_TEXT}em`;
  text.style.lineHeight = `${gap}px`;

  const boxTop = offsetWithin(box, card);
  const boxBottom = boxTop + box.clientHeight - parseFloat(getComputedStyle(box).paddingBottom);
  // The first row that starts inside the box, and how many whole rows fit below it.
  const first = ruleTop + Math.max(0, Math.ceil((boxTop - ruleTop) / gap)) * gap;
  const rows = Math.floor((boxBottom - first) / gap);
  const lines = Math.round(text.offsetHeight / gap);
  if (lines > rows) return false;

  text.style.marginTop = `${first + Math.floor((rows - lines) / 2) * gap - boxTop}px`;
  text.style.transform = baselineShift(gap);
  return true;
}

export function FitText({ className, children, ruled }: { className?: string; children: React.ReactNode; ruled?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t) return;
    const card = ruled ? b.closest<HTMLElement>(".index-card") : null;
    const overflows = () => b.scrollHeight > b.clientHeight;
    const setStep = (step: number) => { t.style.fontSize = step ? `${1 - step * FIT_STEP}em` : ""; };
    const fit = () => {
      setStep(0);
      t.style.lineHeight = "";
      t.style.marginTop = "";
      t.style.transform = "";
      if (card) {
        const aligned = RULE_SCALES.some((scale) => alignToRules(card, b, t, scale));
        card.toggleAttribute("data-unruled", !aligned);
        if (aligned) return;
        card.style.removeProperty("--rule-gap");
        setStep(0);
        t.style.lineHeight = "";
      }
      if (!overflows()) return;
      // Binary search for the largest size that fits. Each check forces a layout, so this
      // takes ~4 instead of up to FIT_STEPS. Falls back to the smallest size.
      let lo = 1;
      let hi = FIT_STEPS;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        setStep(mid);
        if (overflows()) lo = mid + 1;
        else hi = mid;
      }
      setStep(lo);
    };
    fit();
    // Refit when the card changes size, which includes the window changing width (rem
    // sizes follow it). The observer also fires once right away; skip that, since the
    // box hasn't changed since fit() above.
    let size = { w: b.clientWidth, h: b.clientHeight };
    const ro = new ResizeObserver(() => {
      if (b.clientWidth === size.w && b.clientHeight === size.h) return;
      size = { w: b.clientWidth, h: b.clientHeight };
      fit();
    });
    ro.observe(b);
    // Refit once the card font has loaded, if it's still loading.
    let live = true;
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => live && fit());
    return () => { live = false; ro.disconnect(); };
  }, [children, ruled]);

  return (
    <div ref={box} className={cx("flex min-h-0 flex-1 overflow-y-auto", className)}>
      {/* overflow-wrap:anywhere lets a long word with no spaces break instead of running off the card */}
      <div ref={text} className="m-auto max-w-full whitespace-pre-wrap leading-snug [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}
