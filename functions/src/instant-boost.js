// 自助抽卡 Boost rules and the 擲球捕卡 game. Pure code with no imports: src/instantBoost.js
// is an exact copy for the page (a test keeps the two identical), so the ball the player
// sees is the ball the server replays.
//
// One table for every odds mode. A free number costs at most (chance × heaven value) and a
// card priced at BOOST_MIN_MARGIN or more earns at least a fifth of that per paid number,
// so 5 paid numbers cover 1 free number even if every player reaches the top prize. The
// paid Boost fee covers the larger prizes the same way.
export const BOOST_MIN_MARGIN = 1.2;
export const BOOST_FEE_NUMBERS = 4;
export const BOOST_FREE_COOLDOWN_MS = 8 * 60 * 60 * 1000;
export const BOOST_PAID_DAILY_LIMIT = 3;
export const BOOST_RUN_TTL_MS = 15 * 60 * 1000;
export const BOOST_TIERS = [
  { min: 10, free: [2], paid: [2, 4] },
  { min: 15, free: [2, 3], paid: [2, 4, 6] },
  { min: 20, free: [2, 4], paid: [2, 4, 8] },
];

// The highest tier a purchase of `count` numbers reaches, or null.
export function boostTier(count) {
  return BOOST_TIERS.filter((tier) => count >= tier.min).pop() || null;
}

// The next tier up, for "再選 N 個" hints, or null at the top.
export function nextBoostTier(count) {
  return BOOST_TIERS.find((tier) => count < tier.min) || null;
}

export const BOOST_THROW_WINDOW_MS = 6000;
export const BOOST_FLIGHT_MS = 420;
// Each stage is smaller and faster; tuned towards hit rates of 70%, 50% and 35%.
export const BOOST_STAGES = [
  { radius: 0.1, ballMs: 2100, targetMs: 2900 },
  { radius: 0.075, ballMs: 1750, targetMs: 2300 },
  { radius: 0.055, ballMs: 1450, targetMs: 1800 },
];

// A small seeded generator (mulberry32): the same seed gives page and server the same motion.
function seededValues(seed, count) {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  });
}

// Ball and target positions at `ms` into a throw, each 0 (left) to 1 (right).
export function boostPositions(seed, stage, ms) {
  const config = BOOST_STAGES[stage];
  const [ballPhase, phaseA, phaseB, skew] = seededValues(seed, 4);
  const ballTurn = (ms / config.ballMs + ballPhase) % 1;
  const ball = 0.5 + 0.42 * (4 * Math.abs(ballTurn - 0.5) - 1);
  const wave = (ms / config.targetMs) * Math.PI * 2;
  const target = 0.5 + 0.4 * (0.62 * Math.sin(wave + phaseA * Math.PI * 2)
    + 0.38 * Math.sin(wave * (1.6 + skew * 0.8) + phaseB * Math.PI * 2));
  return { ball, target };
}

// The ball leaves at tapMs and flies straight up, so the target must be there on arrival.
export function boostThrowHits(seed, stage, tapMs) {
  const { ball } = boostPositions(seed, stage, tapMs);
  const { target } = boostPositions(seed, stage, tapMs + BOOST_FLIGHT_MS);
  return Math.abs(ball - target) <= BOOST_STAGES[stage].radius;
}
