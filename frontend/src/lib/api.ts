// Everything that talks to the backend lives here: shared types,
// authenticated fetch, data hooks and the Versus socket.
"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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

const noSubscribe = () => () => {};

/**
 * A value that only the browser knows (localStorage, the URL), read during render.
 * The server render and hydration get `serverValue`, then React re-renders with
 * `read()`. Reread on every render, so pass a cheap function that returns a string,
 * number, boolean or null (an object would be "new" on every call).
 */
export function useClientValue<T>(read: () => T, serverValue: T) {
  return useSyncExternalStore(noSubscribe, read, () => serverValue);
}

/** Redirects to sign in when there's no token. Returns true once signed in. */
export function useRequireAuth() {
  // null until hydrated, so the server render doesn't count as signed out
  const signedIn = useClientValue(() => getToken() !== null, null);
  useEffect(() => {
    if (signedIn === false) window.location.href = signInUrl();
  }, [signedIn]);
  return signedIn === true;
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
    const request = getToken() ? api<Folder[]>("/api/folders") : Promise.resolve([]);
    request
      .then((d) => setFolders(Array.isArray(d) ? d : []))
      .catch(() => setFolders([]))
      .finally(() => setLoading(false));
  }, []);

  return { folders, setFolders, loading };
}

const NO_CARDS: Card[] = [];

export function useCards(folderId: string) {
  const [cards, setCards] = useState<Card[]>([]);
  // The folder `cards` was loaded for. While it differs from folderId, a load is in flight.
  const [loadedFor, setLoadedFor] = useState("");
  // Bumped by reload() to fetch the same folder again.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!folderId) return;
    let live = true; // ignore a slow response after switching folders
    api<Card[]>(`/api/flashcards?folderId=${folderId}`)
      .then((d) => (Array.isArray(d) ? d : []))
      .catch(() => NO_CARDS)
      .then((d) => {
        if (!live) return;
        setCards(d);
        setLoadedFor(folderId);
      });
    return () => { live = false; };
  }, [folderId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const loading = folderId !== "" && loadedFor !== folderId;

  return { cards: folderId ? cards : NO_CARDS, setCards, loading, reload };
}

/* ── Versus socket ─────────────────────────────────────── */
// Keep socket.io client and server on the same major version.

let socket: Socket | null = null;

// The socket server the browser connects to. NEXT_PUBLIC_SOCKET_URL overrides it (set at build time).
// Unset in production means the same address as the page (AWS routes /socket.io).
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:5000");

export function getSocket() {
  if (socket) return socket;
  const token = getToken();
  socket = io(SOCKET_URL, {
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
