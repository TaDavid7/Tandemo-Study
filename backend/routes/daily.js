const express = require("express");
const Flashcard = require("../models/Flashcard");
const Folder = require("../models/Folder");
const auth = require("../middleware/auth");
const { nextSchedule, todayBounds, parseTzOffset, MAX_REVIEW, MAX_NEW } = require("../lib/schedule");

const router = express.Router();

const CARD_FIELDS = { question: 1, answer: 1, folder: 1, ease: 1, interval: 1, reps: 1, lapses: 1, due: 1 };

/** Matches the cards in the folders the user picked for Daily. */
async function sessionMatch(userId) {
  const scheduled = await Folder.find({ user: userId, schedule: true }).select("_id").lean();
  const match = { user: userId };
  if (scheduled.length) match.folder = { $in: scheduled.map((f) => f._id) };
  return match;
}

/**
 * Never-reviewed cards, picked at random, up to MAX_NEW per folder per day. The limit
 * is per folder so that studying one folder doesn't leave another with nothing to
 * start. It's per day, not per request, so reopening Daily doesn't hand out a fresh batch.
 */
async function pickNewCards(match, startOfToday, endOfToday) {
  const [started, folders] = await Promise.all([
    Flashcard.aggregate([
      { $match: { ...match, firstReviewedAt: { $gte: startOfToday, $lte: endOfToday } } },
      { $group: { _id: "$folder", count: { $sum: 1 } } },
    ]),
    Flashcard.distinct("folder", { ...match, lastReviewedAt: null }),
  ]);
  const startedIn = new Map(started.map((s) => [String(s._id), s.count]));

  const batches = await Promise.all(
    folders.map((folder) => {
      const left = MAX_NEW - (startedIn.get(String(folder)) ?? 0);
      if (left <= 0) return [];
      return Flashcard.aggregate([
        { $match: { ...match, folder, lastReviewedAt: null } },
        { $sample: { size: left } },
        { $project: CARD_FIELDS },
      ]);
    })
  );
  return batches.flat();
}

// GET /api/daily?tz=<Date#getTimezoneOffset()>
// Reviews: cards seen before and due by the end of the user's today.
// News: see pickNewCards.
// cardCount: every card in those folders, whether or not it's due.
router.get("/daily", auth, async (req, res) => {
  try {
    const baseMatch = await sessionMatch(req.user._id);
    const { start: startOfToday, end: endOfToday } = todayBounds(new Date(), parseTzOffset(req.query.tz));

    const review = await Flashcard.find({
      ...baseMatch,
      due: { $lte: endOfToday },
      lastReviewedAt: { $ne: null },
    })
      .select(CARD_FIELDS)
      .sort({ due: 1, _id: 1 })
      .limit(MAX_REVIEW)
      .lean();

    const news = await pickNewCards(baseMatch, startOfToday, endOfToday);
    const cardCount = await Flashcard.countDocuments(baseMatch);

    res.json({ review, news, cardCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/daily/practice
// Cards to go through when nothing is due, in random order. A folder smaller than
// the daily new-card limit runs out of new cards in one session and then has
// nothing to show until its reviews come due. Practice isn't sent to /review, so it
// doesn't change the schedule.
router.get("/daily/practice", auth, async (req, res) => {
  try {
    const cards = await Flashcard.aggregate([
      { $match: await sessionMatch(req.user._id) },
      { $sample: { size: MAX_REVIEW } },
      { $project: CARD_FIELDS },
    ]);
    res.json({ cards });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/review", auth, async (req, res) => {
  try {
    const { cardId, grade } = req.body || {};
    if (!cardId || ![0, 1, 2, 3].includes(grade)) {
      return res.status(400).json({ error: "cardId and grade (0..3) required" });
    }

    const card = await Flashcard.findOne(
      { _id: cardId, user: req.user._id },
      "ease interval reps lapses due lastReviewedAt firstReviewedAt"
    );
    if (!card) return res.status(404).json({ error: "not found" });

    Object.assign(card, nextSchedule(card, grade, new Date()));
    await card.save();

    res.json({
      _id: card._id,
      ease: card.ease,
      interval: card.interval,
      reps: card.reps,
      lapses: card.lapses,
      due: card.due,
      lastReviewedAt: card.lastReviewedAt,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
