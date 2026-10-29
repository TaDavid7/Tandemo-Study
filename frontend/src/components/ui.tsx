// Shared building blocks used by every page.
"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

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
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setMounted(true); setClosing(false); }
    else if (mounted) setClosing(true);
  }

  // While closing, keep showing what the dialog showed last, so the title or fields
  // don't change under the fade (e.g. "Edit card" turning into "Add card").
  const last = useRef({ title, children });
  if (open) last.current = { title, children };
  const shown = open ? { title, children } : last.current;

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
        aria-label={shown.title}
        className="modal-panel w-full max-w-lg rounded-xl border border-line bg-card p-6 shadow-2xl mobile:max-w-[30rem] mobile:rounded-b-none mobile:border-b-0 mobile:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-xl font-semibold">{shown.title}</h2>
        {shown.children}
      </div>
    </div>
  );
}

/* ── Flip card ────────────────────────────────────────── */
// The index card used for studying everywhere in the app.
// The turn is a CSS transition (.flip-card in globals.css), so it runs on the
// compositor and reverses from mid-turn if the card is flipped again.

export function FlipCard({
  front,
  back,
  flipped,
  onFlip,
  className,
}: {
  front: React.ReactNode;
  back: React.ReactNode;
  flipped: boolean;
  onFlip?: () => void;
  className?: string;
}) {
  const face =
    "flip-face index-card absolute inset-0 flex flex-col rounded-xl border border-line shadow-[0_1px_0_var(--line),0_12px_30px_-12px_rgb(0_0_0/0.25)]";
  const body = "px-10 pb-10 text-center font-card text-3xl leading-snug mobile:px-6 mobile:pb-8 mobile:text-2xl";
  return (
    <div className={cx("flip-card", className)} data-flipped={flipped ? "" : undefined}>
      <button
        type="button"
        onClick={onFlip}
        aria-label={flipped ? "Show question" : "Show answer"}
        className="flip-card-inner relative block h-full w-full cursor-pointer text-left"
      >
        <div className={cx(face, "flip-face-front")}>
          <span className="px-7 pt-5 text-sm text-muted">Question</span>
          <FitText className={body}>{front}</FitText>
        </div>
        <div className={cx(face, "flip-face-back")}>
          <span className="px-7 pt-5 text-sm text-muted">Answer</span>
          <FitText className={body}>{back}</FitText>
        </div>
      </button>
    </div>
  );
}

/* ── Fit text ─────────────────────────────────────────── */
// Card text that keeps its line breaks and shrinks until it fits its box, down to
// FIT_MIN of the box's font size. Anything still too tall scrolls from the first
// line (m-auto rather than justify-center, so the top is never clipped).

const FIT_MIN = 0.5;
const FIT_STEP = 0.05;

export function FitText({ className, children }: { className?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t) return;
    const fit = () => {
      let scale = 1;
      t.style.fontSize = "";
      while (scale > FIT_MIN && b.scrollHeight > b.clientHeight) {
        scale -= FIT_STEP;
        t.style.fontSize = `${scale}em`;
      }
    };
    fit();
    // Refit when the card changes size, and once the card font has loaded.
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    let live = true;
    document.fonts?.ready.then(() => live && fit());
    return () => { live = false; ro.disconnect(); };
  }, [children]);

  return (
    <div ref={box} className={cx("flex min-h-0 flex-1 overflow-y-auto", className)}>
      <div ref={text} className="m-auto whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}
