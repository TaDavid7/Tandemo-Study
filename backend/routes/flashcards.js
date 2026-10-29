const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Flashcard = require("../models/Flashcard");
const Folder = require("../models/Folder");
const UsageLog = require("../models/UsageLog");
const auth = require("../middleware/auth");
const { generateFlashcardsFromTextWithAI } = require("../lib/ai");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function getTodayDateOnly() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Same limit as the card dialog (frontend/src/app/home/page.tsx).
const MAX_WORDS = 100;
const tooLong = (...texts) =>
  texts.some((s) => typeof s === "string" && s.split(/\s+/).filter(Boolean).length > MAX_WORDS);

router.get("/", auth, async (req, res) => {
  try {
    const q = { user: req.user._id };
    if (req.query.folderId) q.folder = req.query.folderId;
    const cards = await Flashcard.find(q).sort({ _id: 1 }).lean();
    res.json(cards);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const { question, answer, folder } = req.body || {};
    if (!question || !answer || !folder) {
      return res.status(400).json({ error: "question, answer, folder required" });
    }
    if (tooLong(question, answer)) {
      return res.status(400).json({ error: `Keep the question and answer to ${MAX_WORDS} words each.` });
    }
    const card = await Flashcard.create({ question, answer, folder, user: req.user._id });
    res.status(201).json(card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/:id", auth, async (req, res) => {
  try {
    const { question, answer, folder } = req.body || {};
    if (tooLong(question, answer)) {
      return res.status(400).json({ error: `Keep the question and answer to ${MAX_WORDS} words each.` });
    }
    const card = await Flashcard.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        ...(question && { question }),
        ...(answer && { answer }),
        ...(folder && { folder }),
      },
      { new: true }
    );
    if (!card) return res.status(404).json({ error: "not found" });
    res.json(card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const del = await Flashcard.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!del) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/import/pdf", auth, upload.single("file"), async (req, res) => {
  try {
    const today = getTodayDateOnly();
    const log = await UsageLog.findOne({ userId: req.user._id, date: today });
    if (log && log.count >= 5) {
      return res.status(429).json({ error: "Daily PDF import limit reached (5 per day)." });
    }
    const { folderId } = req.body;
    if (!folderId) return res.status(400).json({ error: "folderId is required" });
    if (!req.file) return res.status(400).json({ error: "PDF file is required" });

    const folder = await Folder.findOne({ _id: folderId, user: req.user._id });
    if (!folder) return res.status(404).json({ error: "Folder not found" });

    const pdfData = await pdfParse(req.file.buffer);
    if (!pdfData.text?.trim()) {
      return res.status(400).json({ error: "Please try importing a pdf where you can select/copy text" });
    }

    const cards = await generateFlashcardsFromTextWithAI(pdfData.text);
    await UsageLog.updateOne(
      { userId: req.user._id, date: today },
      { $inc: { count: 1 } },
      { upsert: true }
    );

    if (cards.length === 0) {
      return res.status(500).json({ error: "No flashcards generated from PDF" });
    }

    const created = await Flashcard.insertMany(
      cards.map((c) => ({ question: c.question, answer: c.answer, folder: folder._id, user: req.user._id }))
    );
    return res.json({ createdCount: created.length, cards: created });
  } catch (err) {
    console.error("PDF import error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
});

module.exports = router;
