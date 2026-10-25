// backend/sockets/versus.js
const Flashcard = require("../models/Flashcard");
const Folder = require("../models/Folder");

// How long the answer stays on screen before the next question.
const REVEAL_MS = 2500;
// Range of seconds per question the host can pick in timed mode (whole seconds).
const MIN_SECONDS = 5;
const MAX_SECONDS = 60;

function createCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // skip confusing chars if desired
  let s = "";
  for (let i = 0; i < 6; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}

function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

/** rooms: Map<code, Room>
 * Room = {
 *   code, hostId, folderId,
 *   settings: { mode: "first" | "timed", seconds: number },
 *     first: the first correct answer takes the point and ends the question.
 *     timed: everyone gets `seconds` to answer; every correct answer scores.
 *   started: boolean, finished: boolean,
 *   currentIndex: number,
 *   // deck holds current game's cards + normalized answers for quick checks
 *   deck: Array<{ id: string, question: string, answer: string, answerNorm: string }>,
 *   solvedBy: string[],     // socketIds that answered the current question, in order
 *   revealed: boolean,      // current answer is showing; next question is on its way
 *   deadline: number|null,  // timed mode: when the current question closes (ms)
 *   timer,                  // pending timeout for the deadline or the next question
 *   // players keyed by socketId
 *   players: Map<string, { socketId: string, username: string, score: number }>,
 * }
 */
const rooms = new Map();

function serialize(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    folderId: room.folderId,
    settings: room.settings,
    started: room.started,
    finished: room.finished,
    currentIndex: room.currentIndex,
    totalQuestions: room.deck.length,
    solvedBy: room.solvedBy,
    // Remaining time rather than the deadline itself, so client clocks don't matter.
    remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
    players: Array.from(room.players.values()).map(p => ({
      socketId: p.socketId,
      username: p.username,
      score: p.score,
    })),
  };
}

function broadcastState(io, room) {
  const q = room.started ? room.deck[room.currentIndex] : null;
  io.to(room.code).emit("roomState", {
    ...serialize(room),
    currentQuestion: q ? { id: q.id, question: q.question } : null,
    answer: q && room.revealed ? q.answer : null,
  });
}

function clearTimer(room) {
  clearTimeout(room.timer);
  room.timer = null;
}

function closeRoom(room) {
  clearTimer(room);
  rooms.delete(room.code);
}

function startQuestion(io, room) {
  clearTimer(room);
  room.solvedBy = [];
  room.revealed = false;
  room.deadline = null;
  if (room.settings.mode === "timed") {
    const ms = room.settings.seconds * 1000;
    room.deadline = Date.now() + ms;
    room.timer = setTimeout(() => endQuestion(io, room), ms);
  }
  broadcastState(io, room);
}

// Shows everyone the answer, then moves on by itself.
function endQuestion(io, room) {
  if (!room.started || room.revealed) return;
  clearTimer(room);
  room.revealed = true;
  room.deadline = null;
  broadcastState(io, room);
  room.timer = setTimeout(() => nextOrFinish(io, room), REVEAL_MS);
}

function nextOrFinish(io, room) {
  clearTimer(room);
  if (room.currentIndex < room.deck.length - 1) {
    room.currentIndex += 1;
    startQuestion(io, room);
  } else {
    room.started = false;
    room.finished = true;
    broadcastState(io, room);
  }
}

function everyoneSolved(room) {
  return room.players.size > 0 && Array.from(room.players.keys()).every(id => room.solvedBy.includes(id));
}

module.exports = function attachVersus(io) {
  io.on("connection", (socket) => {
    socket.on("createRoom", async ({ folderId, username }, check) => {
      try{

        if (!socket.data?.userId) throw new Error("Unauthorized");
        if (!folderId) throw new Error("folderId required");
        const folder = await Folder.findOne({ _id: folderId, user: socket.data.userId }).lean();
        if (!folder) throw new Error("Folder not found or unauthorized");
        const code = createCode();
        const room = {
          code,
          hostId: socket.id,
          hostUserId: socket.data.userId,
          folderId: folderId || null,
          settings: { mode: "first", seconds: 20 },
          started: false,
          finished: false,
          currentIndex: 0,
          deck: [],
          solvedBy: [],
          revealed: false,
          deadline: null,
          timer: null,
          players: new Map(),
        };
        rooms.set(code, room);

        socket.join(code);
        room.players.set(socket.id, {
          socketId: socket.id,
          username: (username && String(username).trim()) || "Host",
          score: 0,
          userId: socket.data.userId,
        });

        broadcastState(io, room);

        check?.({ok: true, code});

      } catch (e){
        check?.({ok: false, error: e.message || "createRoom failed"});
      }
    });

    // Join an existing room and receive the latest state
    socket.on("joinRoom", async ({ code, username }) => {
      code = String(code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }
      socket.join(code);

      if (room.hostUserId && socket.data?.userId &&
          String(socket.data.userId) === String(room.hostUserId)) {
            room.hostId = socket.id;
      }
      if (username) {
        const name = String(username).trim() || "Player";
        const existing = room.players.get(socket.id);
        // Joining again from the room page keeps the score.
        if (existing) existing.username = name;
        else room.players.set(socket.id, { socketId: socket.id, username: name, score: 0, userId: socket.data?.userId });
      }
      broadcastState(io, room);
    });

    // Host picks the game mode in the lobby
    socket.on("updateSettings", ({ code, mode, seconds }) => {
      code = String(code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room || room.hostId !== socket.id || room.started) return;
      if (mode === "first" || mode === "timed") room.settings = { ...room.settings, mode };
      const s = Number(seconds);
      if (Number.isInteger(s) && s >= MIN_SECONDS && s <= MAX_SECONDS) room.settings = { ...room.settings, seconds: s };
      broadcastState(io, room);
    });

    // Host starts (or restarts) the game; lock a deck order and broadcast index 0
    socket.on("startGame", async ({ code }) => {
      code = String(code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      if (room.hostId !== socket.id) return;
      if (room.started) return;

      try {
        const hostPlayer = room.players.get(room.hostId);
        if (!hostPlayer) {
          socket.emit("error", { message: "Host not found" });
          return;
        }

        //Fetch cards from the host's folder
        const cards = await Flashcard
          .find({ folder: room.folderId, user: hostPlayer.userId })
          .select("_id question answer")
          .lean();

        if (!cards.length) {
          socket.emit("error", { message: "This folder has no cards to play." });
          return;
        }

        room.deck = cards.map((c) => ({
          id: String(c._id),
          question: c.question,
          answer: c.answer,
          answerNorm: normalize(c.answer),
        }));

        for (const p of room.players.values()) p.score = 0;
        room.currentIndex = 0;
        room.started = true;
        room.finished = false;

        startQuestion(io, room);
      } catch (err) {
        console.error("startGame error:", err.message);
        socket.emit("error", { message: "Server error during startGame" });
      }
    });


    // Client sends a guess; server validates and, if correct, awards a point once per question
    socket.on("submitGuess", ({ code, guess }) => {
      code = String(code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room || !room.started || room.revealed) return;

      const current = room.deck[room.currentIndex];
      if (!current) return; // no cards

      const player = room.players.get(socket.id);
      if (!player) return; // not tracked
      if (room.solvedBy.includes(socket.id)) return;

      const g = normalize(guess);
      const correct = g && g === current.answerNorm;

      if (correct) {
        player.score += 1;
        room.solvedBy.push(socket.id);
        io.to(socket.id).emit("guessResult", { correct: true });
        if (room.settings.mode === "first" || everyoneSolved(room)) endQuestion(io, room);
        else broadcastState(io, room);
      } else {
        io.to(socket.id).emit("guessResult", { correct: false });
      }
    });

    // Host skips: show the answer now (then it moves on), or move on now if it's already showing
    socket.on("nextQuestion", ({ code }) => {
      code = String(code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room || !room.started) return;
      if (room.hostId !== socket.id) return;
      if (room.revealed) nextOrFinish(io, room);
      else endQuestion(io, room);
    });

    socket.on("exitGame", ({ code }) => {
      code = String(code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room || room.hostId !== socket.id) return;

      closeRoom(room);
      io.to(code).emit("roomClosed");
      io.socketsLeave(code); // disconnect all from room
    });


    socket.on("disconnect", () => {
      for (const room of rooms.values()) {
        if (!room.players.has(socket.id)) continue;
        room.players.delete(socket.id);

        if (room.hostId === socket.id) {
          const next = room.players.values().next().value;
          if (next) room.hostId = next.socketId; else { closeRoom(room); continue; }
        }
        // In timed mode the question can close early once everyone left has answered
        if (room.started && !room.revealed && room.settings.mode === "timed" && everyoneSolved(room)) {
          endQuestion(io, room);
        } else {
          broadcastState(io, room);
        }
      }
    });
  });
};
