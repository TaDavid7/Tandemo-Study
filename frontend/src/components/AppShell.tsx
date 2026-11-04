// App frame: theme, motion settings, layout mode, navigation and service worker.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { MotionConfig, motion } from "framer-motion";
import React, { createContext, useContext, useEffect, useState } from "react";
import { getUsername } from "@/lib/api";

const navItems = [
  { href: "/home", label: "Decks", icon: "M4 7h12v12H4zM8 3h12v12" },
  { href: "/daily", label: "Daily", icon: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" },
  { href: "/speedrun", label: "Speedrun", icon: "M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l2 2M10 2h4" },
  { href: "/versus", label: "Versus", icon: "M9 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M14 14.5a6 6 0 017 5.5" },
];

/* ── Layout mode ──────────────────────────────────────── */
// "Mobile" swaps in the phone layout: bottom tabs, one column, bigger touch targets.
// It's on automatically below 768px, and the header button can force either layout
// (saved in localStorage). The choice lives on <html data-mobile>, which the
// `mobile:` style variant in globals.css reads. layout.tsx sets it before the first
// paint so phones never flash the desktop layout.

const PHONE_QUERY = "(max-width: 767px)";
type Override = "mobile" | "desktop" | null;

const MobileContext = createContext(false);
/** True when the phone layout is showing. For behaviour that CSS can't express, like swipe. */
export const useMobile = () => useContext(MobileContext);

function readOverride(): Override {
  try {
    const v = localStorage.getItem("layout");
    return v === "mobile" || v === "desktop" ? v : null;
  } catch {
    return null;
  }
}

function useLayoutMode() {
  // null until mounted, so the server and first client render agree
  const [mode, setMode] = useState<{ override: Override; narrow: boolean } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const update = () => setMode((m) => ({ override: m ? m.override : readOverride(), narrow: mq.matches }));
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const mobile = mode ? (mode.override ? mode.override === "mobile" : mode.narrow) : null;

  useEffect(() => {
    if (mobile !== null) document.documentElement.toggleAttribute("data-mobile", mobile);
  }, [mobile]);

  const toggle = () => {
    if (!mode) return;
    const next = !mobile;
    // Matching what the screen would pick anyway clears the override.
    const override: Override = next === mode.narrow ? null : next ? "mobile" : "desktop";
    try {
      if (override) localStorage.setItem("layout", override);
      else localStorage.removeItem("layout");
    } catch {}
    setMode({ ...mode, override });
  };

  return { mobile: mobile ?? false, narrow: mode?.narrow ?? false, ready: mode !== null, toggle };
}

/* ── Header pieces ────────────────────────────────────── */

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  const dark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-ink/5 hover:text-ink"
    >
      <motion.svg
        key={dark ? "sun" : "moon"}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-[18px] w-[18px]"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
        )}
      </motion.svg>
    </button>
  );
}

/** Switches between the desktop and phone layouts. Shows the layout you'd switch to. */
function LayoutToggle({ mobile, ready, onToggle }: { mobile: boolean; ready: boolean; onToggle: () => void }) {
  if (!ready) return <div className="h-9 w-9" />;
  return (
    <button
      onClick={onToggle}
      aria-label={mobile ? "Switch to desktop layout" : "Switch to mobile layout"}
      title={mobile ? "Desktop layout" : "Mobile layout"}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-ink/5 hover:text-ink"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
        {mobile ? (
          <path d="M3 5h18v11H3zM8 20h8M12 16v4" />
        ) : (
          <path d="M7 2h10v20H7zM11 18h2" />
        )}
      </svg>
    </button>
  );
}

function Header({ mobile, ready, onToggleLayout }: { mobile: boolean; ready: boolean; onToggleLayout: () => void }) {
  const pathname = usePathname();
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => setUser(getUsername()), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-desk/85 backdrop-blur">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-8 mobile:flex mobile:max-w-[30rem] mobile:justify-between mobile:px-4">
        <Link href="/" className="flex items-center gap-2.5 justify-self-start">
          <span lang="ja" className="grid h-7 w-7 -rotate-6 place-items-center rounded-md bg-hl text-sm font-bold text-hl-ink">
            た
          </span>
          <span className="text-lg font-semibold tracking-tight">Tandemo</span>
        </Link>

        {/* On phones these move to the bottom tab bar */}
        <nav className="flex items-center gap-1 mobile:hidden">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-4 py-2 text-[15px] font-medium transition ${active ? "text-hl-ink" : "text-muted hover:text-ink"}`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-highlight"
                    className="absolute inset-x-1.5 inset-y-1.5 -skew-x-6 rounded-[5px] bg-hl"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 justify-self-end mobile:gap-1">
          <LayoutToggle mobile={mobile} ready={ready} onToggle={onToggleLayout} />
          <ThemeToggle />
          <Link
            href="/account"
            aria-label={user ? `Account: ${user}` : "Sign in"}
            className="flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-medium transition hover:border-muted"
          >
            {user ? (
              <>
                <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] text-card">
                  {user[0]?.toUpperCase()}
                </span>
                <span className="mobile:hidden">{user}</span>
              </>
            ) : (
              "Sign in"
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Phone navigation: four tabs along the bottom, in thumb reach. */
function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-line bg-desk/90 pb-[env(safe-area-inset-bottom)] backdrop-blur mobile:block">
      <div className="mx-auto grid max-w-[30rem] grid-cols-4">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${active ? "text-ink" : "text-muted"}`}
            >
              <span className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${active ? "bg-hl text-hl-ink" : ""}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d={item.icon} />
                </svg>
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Desktop layout forced on a phone: the header doesn't fit, so its layout button can end up
 *  off-screen. This keeps a way back in reach. */
function BackToMobile({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-card shadow-lg"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
        <path d="M7 2h10v20H7zM11 18h2" />
      </svg>
      Back to mobile layout
    </motion.button>
  );
}

// App pages that use a blue highlighter in light mode (see [data-accent] in globals.css).
const blueAccentPages = ["/home", "/daily", "/speedrun", "/versus"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const blue = blueAccentPages.some((p) => pathname.startsWith(p));
  const layout = useLayoutMode();

  // Offline app-shell caching (see docs/ADR1_offline_model). public/sw.js is still a stub.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <MotionConfig reducedMotion="user">
        <MobileContext.Provider value={layout.mobile}>
          <div className="flex min-h-screen flex-col overflow-x-clip" data-accent={blue ? "blue" : undefined}>
            <Header mobile={layout.mobile} ready={layout.ready} onToggleLayout={layout.toggle} />
            <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-12 mobile:max-w-[30rem] mobile:px-4 mobile:pb-28 mobile:pt-6">
              {children}
            </main>
            <TabBar />
            {layout.ready && layout.narrow && !layout.mobile && <BackToMobile onClick={layout.toggle} />}
          </div>
        </MobileContext.Provider>
      </MotionConfig>
    </ThemeProvider>
  );
}
