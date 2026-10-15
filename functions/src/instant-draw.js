// 自助抽卡: a player picks a card, an odds mode and up to 20 numbers; each number is
// one independent draw, decided on the server the moment it is paid for. The
// settings (on / off, card pool, daily limit) live in publicSiteSettings/instantDraw
// so guests can see the pool; prices always come from the card library.
import { randomInt } from "node:crypto";

export const INSTANT_SHARE_MODES = ["1/2", "1/5", "1/10"];
// Chance of heaven for each odds mode.
export const INSTANT_HEAVEN_CHANCE = { "1/2": 1 / 2, "1/5": 1 / 5, "1/10": 1 / 10 };
export const INSTANT_NUMBER_COUNT = 20;
export const DEFAULT_INSTANT_DAILY_LIMIT = 500;
export const MAX_INSTANT_DAILY_LIMIT = 10_000_000;
export const MAX_INSTANT_POOL_CARDS = 200;

// The Hong Kong calendar day (no daylight saving) a draw counts towards.
export function hongKongDay(ms = Date.now()) {
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Tokens this player has already spent on 自助抽卡 today.
export function spentToday(user, day = hongKongDay()) {
  return user?.instantDrawDay === day ? Math.max(0, Number(user.instantDrawSpent) || 0) : 0;
}

// 0 means no daily limit.
export function dailyLimit(settings) {
  const limit = Number(settings?.dailyTokenLimit);
  return Number.isSafeInteger(limit) && limit >= 0 && limit <= MAX_INSTANT_DAILY_LIMIT ? limit : DEFAULT_INSTANT_DAILY_LIMIT;
}

// Odds modes a card may be drawn with (cards without the field allow all three).
export function cardShareModes(card) {
  return Array.isArray(card?.allowedShareModes)
    ? INSTANT_SHARE_MODES.filter((mode) => card.allowedShareModes.includes(mode))
    : [...INSTANT_SHARE_MODES];
}

// Same price lookup as a live purchase (firestore.rules cardPriceForShareMode).
export function cardPrice(card, shareMode) {
  const prices = card?.modePrices || {};
  const key = shareMode === "1/10" ? "tenth" : shareMode === "1/5" ? "fifth" : "half";
  const value = Number(prices[key] ?? card?.tokenValue ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

// A card can be in the pool only with a working hell card and at least one price.
export function isDrawableCard(card, hellCard) {
  return Boolean(card && !card.archived && hellCard && !hellCard.archived
    && cardShareModes(card).some((mode) => cardPrice(card, mode) > 0));
}

// The public copy of a pool card: what the page shows, never what the server charges.
export function poolCardSnapshot(id, card) {
  return {
    id,
    name: String(card.name || ""),
    category: String(card.category || ""),
    imageUrl: String(card.imageUrl || ""),
    thumbUrl: String(card.thumbUrl || ""),
    tokenValue: Number(card.tokenValue || 0),
    modePrices: {
      half: cardPrice(card, "1/2"),
      fifth: cardPrice(card, "1/5"),
      tenth: cardPrice(card, "1/10"),
    },
    allowedShareModes: cardShareModes(card),
  };
}

// Distinct numbers 1–20, sorted; anything else is refused.
export function validNumbers(value) {
  if (!Array.isArray(value) || !value.length || value.length > INSTANT_NUMBER_COUNT) return null;
  const numbers = [...new Set(value.map(Number))];
  if (numbers.length !== value.length) return null;
  if (!numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= INSTANT_NUMBER_COUNT)) return null;
  return numbers.sort((left, right) => left - right);
}

// One independent draw: heaven with the mode's chance, using a cryptographic RNG.
export function drawSide(shareMode, random = randomInt) {
  const chance = INSTANT_HEAVEN_CHANCE[shareMode];
  if (!chance) throw new Error(`Unknown share mode ${shareMode}`);
  return random(0, 1_000_000) < Math.round(chance * 1_000_000) ? "heaven" : "hell";
}
