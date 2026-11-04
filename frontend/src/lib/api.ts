// Everything that talks to the backend lives here: shared types,
// authenticated fetch, data hooks and the Versus socket.
"use client";
import { useCallback, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

/* ── Types ─────────────────────────────────────────────── */

export type Folder = {
  _id: string;
  name: string;
  schedule?: boolean;
};

export type Card = {
  _id: string;
  question: string;
  answer: string;
  folder: string;
  ease?: number;
  interval?: number;
  reps?: number;
  lapses?: number;
  due?: string;
};

export type RoomPlayer = { socketId: string; username: string; score: number };

/** "first": first correct answer takes the point. "timed": everyone gets `seconds`, every correct answer scores. */
export type VersusSettings = { mode: "first" | "timed"; seconds: number };

export type RoomState = {
  code: string;
  hostId: string;
  folderId: string | null;
  settings: VersusSettings;
  started: boolean;
  finished: boolean;
  currentIndex: number;
  totalQuestions: number;
  /** socketIds that answered the current question, in order */
  solvedBy: string[];
  /** timed mode: ms left on the current question when this state was sent */
  remainingMs: number | null;
  players: RoomPlayer[];
  currentQuestion?: { id: string; question: string } | null;
  /** the current answer, once it's been revealed */
  answer: string | null;
};

/* ── Auth ──────────────────────────────────────────────── */

export const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("token");

export const getUsername = () =>
  typeof window === "undefined" ? null : localStorage.getItem("username");

/** The sign-in page, set to come back here afterwards. */
const signInUrl = () => `/account?next=${encodeURIComponent(window.location.pathname)}`;

/** fetch() with the auth header. Sends the user to sign in if the session is gone. */
export async function authfetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("token");
    window.location.href = signInUrl();
  }
  return res;
}

/** JSON helper: sends a body as JSON and throws a readable error on failure. */
export async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await authfetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Redirects to sign in when there's no token. Returns true once signed in. */
export function useRequireAuth() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!getToken()) window.location.href = signInUrl();
    else setOk(true);
  }, []);
  return ok;
}

/* ── Data hooks ────────────────────────────────────────── */

/** A shuffled copy of `arr`, for study modes that deal cards in random order. */
export function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api<Folder[]>("/api/folders")
      .then((d) => setFolders(Array.isArray(d) ? d : []))
      .catch(() => setFolders([]))
      .finally(() => setLoading(false));
  }, []);

  return { folders, setFolders, loading };
}

export function useCards(folderId: string) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!folderId) { setCards([]); return Promise.resolve(); }
    setLoading(true);
    return api<Card[]>(`/api/flashcards?folderId=${folderId}`)
      .then((d) => setCards(Array.isArray(d) ? d : []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [folderId]);

  useEffect(() => { reload(); }, [reload]);

  return { cards, setCards, loading, reload };
}

/* ── Versus socket ─────────────────────────────────────── */
// Keep socket.io client and server on the same major version.

let socket: Socket | null = null;

export function getSocket() {
  if (socket) return socket;
  const token = getToken();
  socket = io(process.env.NODE_ENV === "production" ? undefined : "http://localhost:5000", {
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true,
    reconnectionAttempts: 5,
    timeout: 10000,
    auth: token ? { token } : undefined,
  });
  socket.on("connect_error", (err) => console.error("[socket] connect_error:", err?.message || err));
  return socket;
}
