require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const authRoutes = require("./routes/auth");
const folderRoutes = require("./routes/folders");
const flashcardRoutes = require("./routes/flashcards");
const dailyRoutes = require("./routes/daily");
const attachVersus = require("./sockets/versus");

const app = express();
app.use(express.json());

// --- CORS

const allowed = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Allow listed origins and no-origin requests
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      return cb(null, allowed.includes(origin));
    },
    credentials: true,
  })
);

// --- Routes

app.get("/", (_req, res) => res.status(200).send("API OK"));
app.use("/api", authRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/flashcards", flashcardRoutes);
app.use("/api", dailyRoutes);

// --- DB

// MONGO_URL picks the database. Outside production it defaults to a MongoDB on this computer.
const LOCAL_MONGO_URL = "mongodb://127.0.0.1:27017/mem_study";
const MONGO_URL =
  process.env.MONGO_URL || (process.env.NODE_ENV === "production" ? "" : LOCAL_MONGO_URL);
if (!MONGO_URL && process.env.NODE_ENV !== "test") {
  console.error("MONGO_URL is missing");
  process.exit(1);
}

if (process.env.NODE_ENV !== "test") {
  mongoose
    .connect(MONGO_URL, { serverSelectionTimeoutMS: 8000 })
    .then(() => console.log("Mongo connected"))
    .catch((err) => console.error("Mongo connection error:", err?.message || err));
}

// --- HTTP + Socket.IO

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowed.length ? allowed : true,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Unauthorized"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.userId = decoded.userId;
    next();
  } catch (e) {
    next(new Error("Unauthorized"));
  }
});

attachVersus(io);

// --- Start

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

process.on("SIGINT", async () => {
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

module.exports = { app, server };
