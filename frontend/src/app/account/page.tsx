"use client";
import React, { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { getUsername, useClientValue } from "@/lib/api";
import { Button, Field, Notice, Panel, inputClass } from "@/components/ui";

type Mode = "login" | "register";
/** An error, plus the one thing that would fix it (e.g. "Create it" when the account doesn't exist). */
type Problem = { message: string; fix?: { label: string; mode: Mode } };

/** Where to go after signing in: ?next= when it's a page on this site, else the decks. */
function nextPage() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export default function AccountPage() {
  const router = useRouter();
  // "Create a free account" links here with ?mode=signup. The tabs override it once used.
  const signupLink = useClientValue(() => new URLSearchParams(window.location.search).get("mode") === "signup", false);
  const [chosenMode, setMode] = useState<Mode | null>(null);
  const mode: Mode = chosenMode ?? (signupLink ? "register" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const user = useClientValue(getUsername, null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setProblem(null);
    // Keep what's been typed; just move to the field that still needs attention.
    (username.trim() ? passwordRef : usernameRef).current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "no_user") setProblem({ message: data.error, fix: { label: "Create this account", mode: "register" } });
        else if (data.code === "taken") setProblem({ message: `${data.error} If it's yours, sign in instead.`, fix: { label: "Sign in", mode: "login" } });
        else if (data.code === "wrong_password") { setProblem({ message: data.error }); passwordRef.current?.select(); }
        else setProblem({ message: data.error || "Something went wrong. Try again in a moment." });
        return;
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);
      router.push(nextPage());
    } catch {
      setProblem({ message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    window.location.href = "/account"; // full reload so the header updates too
  };

  if (user) {
    return (
      <div className="mx-auto max-w-md pt-8 mobile:pt-2">
        <Panel className="p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink text-2xl font-semibold text-card">
            {user[0]?.toUpperCase()}
          </span>
          <h1 className="mt-4 text-2xl font-bold">{user}</h1>
          <p className="mt-1 text-muted">You&apos;re signed in.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => router.push("/home")}>Go to my decks</Button>
            <Button variant="secondary" onClick={signOut}>Sign out</Button>
          </div>
        </Panel>
      </div>
    );
  }

  const login = mode === "login";

  return (
    <div className="mx-auto max-w-md pt-8 mobile:pt-2">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mb-6"
        >
          <h1 className="text-4xl font-bold tracking-tight mobile:text-3xl">{login ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1.5 text-muted">
            {login ? "Sign in to pick up your decks where you left off." : "Free, and all it takes is a username and password."}
          </p>
        </motion.div>
      </AnimatePresence>

      <Panel className="p-7 mobile:p-5">
        {/* Sign in / Create account, side by side so both are obvious */}
        <div role="tablist" className="mb-6 grid grid-cols-2 rounded-lg bg-desk p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`relative h-9 rounded-md text-sm font-medium transition-colors ${mode === m ? "text-ink" : "text-muted hover:text-ink"}`}
            >
              {mode === m && (
                <motion.span
                  layoutId="account-tab"
                  className="absolute inset-0 rounded-md bg-card shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{m === "login" ? "Sign in" : "Create account"}</span>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <input
              ref={usernameRef}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                autoComplete={login ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`${inputClass} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-muted transition hover:text-ink"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          {!login && <p className="text-sm text-muted">Your username is what other players see in Versus.</p>}
          {problem && (
            <Notice>
              {problem.message}
              {problem.fix && (
                <>
                  {" "}
                  <button type="button" onClick={() => switchMode(problem.fix!.mode)} className="font-semibold underline underline-offset-4">
                    {problem.fix.label}
                  </button>
                </>
              )}
            </Notice>
          )}
          <Button size="lg" className="w-full" disabled={busy}>
            {busy ? "One moment…" : login ? "Sign in" : "Create account"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
