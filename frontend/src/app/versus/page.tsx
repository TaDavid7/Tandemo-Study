"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getSocket, getUsername, RoomState, useClientValue, useFolders, useRequireAuth } from "@/lib/api";
import { Button, Chip, Field, Notice, PageHeader, Panel, inputClass } from "@/components/ui";

export default function VersusPage() {
  const signedIn = useRequireAuth();
  const router = useRouter();
  const { folders, loading } = useFolders();
  // Starts as the saved username until something is typed.
  const savedName = useClientValue(getUsername, null);
  const [typedName, setName] = useState<string | null>(null);
  const name = typedName ?? savedName ?? "";
  const [folderId, setFolderId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) return null;

  const begin = (kind: "create" | "join") => {
    const username = name.trim();
    if (!username) { setError("Enter a display name so other players know who you are."); return null; }
    localStorage.setItem("username", username);
    setError(null);
    setBusy(kind);
    return { socket: getSocket(), username };
  };

  const create = () => {
    const s = begin("create");
    if (!s || !folderId) return;
    const timeout = setTimeout(() => { setBusy(null); setError("The server didn't respond. Check your connection and try again."); }, 10000);
    s.socket.emit("createRoom", { folderId, username: s.username }, (resp: { ok: boolean; code?: string; error?: string }) => {
      clearTimeout(timeout);
      if (!resp?.ok || !resp.code) { setBusy(null); setError(resp?.error || "The room couldn't be created."); return; }
      router.push(`/versus/room/${resp.code}`);
    });
  };

  const join = () => {
    const room = code.trim().toUpperCase();
    const s = begin("join");
    if (!s || !room) return;
    const fail = () => {
      clearTimeout(timeout);
      s.socket.off("roomState", onState);
      s.socket.off("error", fail);
      setBusy(null);
      setError(`No room found with code ${room}. Check the code with the host.`);
    };
    const timeout = setTimeout(fail, 6000);
    const onState = (rs: RoomState) => {
      if (rs.code?.toUpperCase() !== room) return;
      clearTimeout(timeout);
      s.socket.off("roomState", onState);
      s.socket.off("error", fail);
      router.push(`/versus/room/${room}`);
    };
    s.socket.on("roomState", onState);
    s.socket.once("error", fail);
    s.socket.emit("joinRoom", { code: room, username: s.username });
  };

  return (
    <div>
      <PageHeader title="Versus" sub="Race friends through the same deck in real time. Play first-to-answer, or timed rounds where everyone gets a shot." />

      <div className="mb-6 max-w-sm">
        <Field label="Your display name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What should others see?" className={inputClass} />
        </Field>
      </div>

      {error && <div className="mb-6 max-w-2xl"><Notice>{error}</Notice></div>}

      <div className="grid grid-cols-2 gap-6 mobile:grid-cols-1 mobile:gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Panel className="flex h-full flex-col p-7">
            <h2 className="text-xl font-semibold">Host a match</h2>
            <p className="mt-1 text-muted">Choose the folder everyone will play. You&apos;ll pick the game mode in the lobby.</p>
            <div className="mt-5 flex flex-1 flex-wrap content-start gap-2">
              {folders.map((f) => (
                <Chip key={f._id} active={folderId === f._id} onClick={() => setFolderId(f._id)}>{f.name}</Chip>
              ))}
              {!loading && !folders.length && <p className="text-sm text-muted">Create a folder in Decks first.</p>}
            </div>
            <Button size="lg" className="mt-6" disabled={!folderId || busy !== null} onClick={create}>
              {busy === "create" ? "Creating room…" : "Create room"}
            </Button>
          </Panel>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <Panel className="flex h-full flex-col p-7">
            <h2 className="text-xl font-semibold">Join a match</h2>
            <p className="mt-1 text-muted">Enter the 6-character code from the host.</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && join()}
              maxLength={6}
              placeholder="ABC123"
              aria-label="Room code"
              className="mt-5 h-20 w-full shrink-0 rounded-lg border border-line bg-desk/60 text-center font-card text-5xl tracking-[0.3em] uppercase outline-none transition placeholder:text-muted/30 focus:border-info focus:bg-card"
            />
            <div className="flex-1" />
            <Button size="lg" className="mt-6" disabled={code.length < 6 || busy !== null} onClick={join}>
              {busy === "join" ? "Joining…" : "Join room"}
            </Button>
          </Panel>
        </motion.div>
      </div>
    </div>
  );
}
