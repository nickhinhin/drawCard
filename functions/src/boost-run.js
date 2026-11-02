// A Boost round of 自助抽卡. The purchase is paid and its board shuffled and locked when
// instantDraw creates the run; the board never leaves the server until the reveal, so the
// game cannot change what the bought numbers hold. Each throw is replayed here from the
// seed, and a run that is left alone is settled for the player when it expires.
import { randomInt } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { BOOST_RUN_TTL_MS, BOOST_THROW_WINDOW_MS, boostThrowHits } from "./instant-boost.js";
import { INSTANT_NUMBER_COUNT, drawBoard, instantRecord, validNumbers } from "./instant-draw.js";

const ALL_NUMBERS = Array.from({ length: INSTANT_NUMBER_COUNT }, (_, index) => index + 1);
// Page and server clocks start a moment apart; a tap later than this is not believed.
const TAP_CLOCK_SLACK_MS = 500;

// What the page may see: never the board.
export function publicRun(id, run) {
  return {
    runId: id, status: run.status, stage: run.stage, ladder: run.ladder, prize: run.prize,
    numbers: run.numbers, boost: run.boost, shareMode: run.shareMode, cardName: run.targetCardName,
    total: run.total, seed: run.status === "playing" ? run.seed : null, lastHit: run.lastHit ?? null,
  };
}

// How the free numbers split: first fill the bought board, the rest go on a new one.
export function bonusSlots(numbers, prize) {
  const open = INSTANT_NUMBER_COUNT - numbers.length;
  return { first: Math.min(open, prize), second: Math.max(0, prize - open) };
}

function pickRandom(pool, count) {
  const left = [...pool];
  return Array.from({ length: count }, () => left.splice(randomInt(0, left.length), 1)[0]);
}

// The player's own picks, refused unless they fill the slots exactly.
export function validBonusPicks(numbers, prize, first, second) {
  const slots = bonusSlots(numbers, prize);
  const check = (value, count) => (count === 0 ? (Array.isArray(value) && !value.length ? [] : null) : validNumbers(value));
  const pickedFirst = check(first ?? [], slots.first);
  const pickedSecond = check(second ?? [], slots.second);
  if (!pickedFirst || !pickedSecond) return null;
  if (pickedFirst.length !== slots.first || pickedSecond.length !== slots.second) return null;
  if (pickedFirst.some((number) => numbers.includes(number))) return null;
  return { first: pickedFirst, second: pickedSecond };
}

// One step of the round. Returns the run's changes.
export function advanceRun(run, action, input, nowMs, random = randomInt) {
  if (action === "start" && run.status === "ready") {
    return { status: "playing", seed: random(1, 2147483647), stageStartedAtMs: nowMs, lastHit: null };
  }
  if (action === "throw" && run.status === "playing") {
    const tapMs = Number(input?.tapMs);
    const believable = input?.tapMs !== null && Number.isFinite(tapMs) && tapMs >= 0 && tapMs <= BOOST_THROW_WINDOW_MS
      && tapMs <= nowMs - run.stageStartedAtMs + TAP_CLOCK_SLACK_MS;
    if (!believable || !boostThrowHits(run.seed, run.stage, tapMs)) {
      return { status: "pick", prize: 0, lastHit: false };
    }
    const last = run.stage >= run.ladder.length - 1;
    return { status: last ? "pick" : "decide", prize: run.ladder[run.stage], lastHit: true };
  }
  if (action === "take" && run.status === "decide") return { status: "pick" };
  if (action === "challenge" && run.status === "decide") {
    return { status: "ready", stage: run.stage + 1, prize: 0, lastHit: null };
  }
  throw new HttpsError("failed-precondition", "這局 Boost 已更新，請重新整理後再試。");
}

// Writes the cards and closes the run. Free numbers only give a card on heaven.
function settleRun(transaction, db, runRef, run, picks, nowMs) {
  const now = FieldValue.serverTimestamp();
  const draws = [];
  run.numbers.forEach((number, index) => {
    const resultSide = run.board[number - 1];
    const ref = db.collection("drawRecords").doc();
    const record = instantRecord(run, number, resultSide, now, {
      tokenCost: run.unitPrice, ...(index === 0 && run.fee ? { boostFee: run.fee } : {}),
    });
    transaction.create(ref, record);
    draws.push({
      recordId: ref.id, number, board: 1, bonus: false, resultSide, cardId: record.cardId, cardName: record.cardName,
      cardImageUrl: record.cardImageUrl, cardConversionValue: record.cardConversionValue,
    });
  });
  const secondBoard = picks.second.length ? drawBoard(run.shareMode) : [];
  const award = (number, board, boardNumber) => {
    const resultSide = board[number - 1];
    if (resultSide !== "heaven") {
      draws.push({
        recordId: "", number, board: boardNumber, bonus: true, resultSide,
        cardId: "", cardName: "未中", cardImageUrl: "", cardConversionValue: 0,
      });
      return;
    }
    const ref = db.collection("drawRecords").doc();
    const record = instantRecord(run, number, resultSide, now, { tokenCost: 0, bonus: true, boostBoard: boardNumber });
    transaction.create(ref, record);
    draws.push({
      recordId: ref.id, number, board: boardNumber, bonus: true, resultSide, cardId: record.cardId, cardName: record.cardName,
      cardImageUrl: record.cardImageUrl, cardConversionValue: record.cardConversionValue,
    });
  };
  picks.first.forEach((number) => award(number, run.board, 1));
  picks.second.forEach((number) => award(number, secondBoard, 2));
  transaction.update(runRef, {
    status: "done", draws, secondBoard, picks, settledAtMs: nowMs, expiresAtMs: FieldValue.delete(),
  });
  transaction.update(db.collection("users").doc(run.uid), { instantBoostRunId: FieldValue.delete(), updatedAt: now });
  return draws;
}

// A run left alone: anything already won is kept and its numbers are picked at random.
function settleExpiredRun(transaction, db, runRef, run, nowMs) {
  const prize = ["decide", "pick"].includes(run.status) ? run.prize : 0;
  const slots = bonusSlots(run.numbers, prize);
  const open = ALL_NUMBERS.filter((number) => !run.numbers.includes(number));
  return settleRun(transaction, db, runRef, run, {
    first: pickRandom(open, slots.first), second: pickRandom(ALL_NUMBERS, slots.second),
  }, nowMs);
}

export async function runBoostAction(db, uid, data, nowMs = Date.now()) {
  const action = String(data?.action || "");
  const runId = String(data?.runId || "");
  if (!["resume", "start", "throw", "take", "challenge", "finish"].includes(action) || !/^[A-Za-z0-9]{1,40}$/.test(runId)) {
    throw new HttpsError("invalid-argument", "Boost 資料不正確。");
  }
  const runRef = db.collection("instantBoostRuns").doc(runId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(runRef);
    if (!snapshot.exists || snapshot.data().uid !== uid) throw new HttpsError("not-found", "找不到這局 Boost。");
    const run = snapshot.data();
    if (run.status === "done") return { run: publicRun(runId, run), draws: run.draws };
    if (nowMs >= run.expiresAtMs) {
      const draws = settleExpiredRun(transaction, db, runRef, run, nowMs);
      return { run: publicRun(runId, { ...run, status: "done" }), draws };
    }
    if (action === "resume") return { run: publicRun(runId, run), draws: null };
    if (action === "finish") {
      if (run.status !== "pick") throw new HttpsError("failed-precondition", "這局 Boost 已更新，請重新整理後再試。");
      const picks = validBonusPicks(run.numbers, run.prize, data?.first, data?.second);
      if (!picks) throw new HttpsError("invalid-argument", "請選好全部贈送號碼。");
      const draws = settleRun(transaction, db, runRef, run, picks, nowMs);
      return { run: publicRun(runId, { ...run, status: "done" }), draws };
    }
    const changes = advanceRun(run, action, data, nowMs);
    const next = { ...run, ...changes };
    // Nothing was won: there is nothing to pick, so the numbers are revealed at once.
    if (next.status === "pick" && !next.prize) {
      const draws = settleRun(transaction, db, runRef, next, { first: [], second: [] }, nowMs);
      return { run: publicRun(runId, { ...next, status: "done" }), draws };
    }
    transaction.update(runRef, { ...changes, expiresAtMs: nowMs + BOOST_RUN_TTL_MS });
    return { run: publicRun(runId, next), draws: null };
  });
}

// Closes runs whose player left, so paid numbers always reach「我的卡牌」.
export async function settleExpiredBoostRuns(db, nowMs = Date.now()) {
  const expired = await db.collection("instantBoostRuns").where("expiresAtMs", "<=", nowMs).limit(200).get();
  for (const item of expired.docs) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(item.ref);
      if (snapshot.exists && snapshot.data().status !== "done") settleExpiredRun(transaction, db, item.ref, snapshot.data(), nowMs);
    });
  }
  return expired.size;
}
