const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// Start and end of the user's current day. `tzOffset` is the browser's
// Date#getTimezoneOffset() (minutes behind UTC). Without it the server's own
// day is used, which on a UTC server starts mid-afternoon in the Americas.
function todayBounds(now = new Date(), tzOffset) {
  if (!Number.isFinite(tzOffset)) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  // Shift to the user's wall clock, take midnight there, then shift back.
  const wall = new Date(now.getTime() - tzOffset * 60000);
  wall.setUTCHours(0, 0, 0, 0);
  const start = new Date(wall.getTime() + tzOffset * 60000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/** Reads a browser timezone offset from a query string; undefined if missing or invalid. */
function parseTzOffset(value) {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? n : undefined;
}

// grade: 0=Again, 1=Hard, 2=Good, 3=Easy
function nextSchedule(card, grade, now = new Date()) {
  let { ease = 2.5, interval = 0, reps = 0, lapses = 0 } = card;
  if (grade === 0) ease -= 0.2;
  else if (grade === 1) ease -= 0.15;
  else if (grade === 3) ease += 0.15;
  ease = clamp(ease, 1.3, 3.0);

  if (grade === 0) {
    reps = 0;
    interval = 1;
    lapses += 1;
  } else if (reps === 0) {
    reps = 1;
    interval = 1;
  } else if (reps === 1) {
    reps = 2;
    interval = 6;
  } else {
    reps += 1;
    interval = Math.max(1, Math.round(interval * ease));
  }

  // Again sets reps back to 0, so "new" means never reviewed (no lastReviewedAt),
  // not reps === 0. firstReviewedAt is what the daily new-card limit counts.
  const firstReview = card.lastReviewedAt ? {} : { firstReviewedAt: now };
  return { ease, interval, reps, lapses, due: addDays(now, interval), lastReviewedAt: now, ...firstReview };
}

// Same as Anki's defaults (200 reviews, 20 new cards a day).
const MAX_REVIEW = 200;
const MAX_NEW = 20;

module.exports = { nextSchedule, todayBounds, parseTzOffset, MAX_REVIEW, MAX_NEW };
