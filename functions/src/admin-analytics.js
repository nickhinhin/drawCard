// A Hong Kong calendar day is a fixed 24-hour UTC interval (Hong Kong has no DST).
export function analyticsDayRange(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return null;
  const start = new Date(`${day}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime()) || day !==
    new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

// Purchase-day margin uses the recorded token cost and settled card conversion value.
// 自助抽卡 draws are reported on their own (instant*), apart from live purchases.
export function summarizeAdminDay(records, reviews, newUserCount, totalUserCount) {
  const paid = records.filter((record) => Number(record.tokenCost) > 0);
  const purchases = paid.filter((record) => record.source !== "instant");
  const instant = paid.filter((record) => record.source === "instant");
  const settled = purchases.filter((record) => Boolean(record.cardId));
  const approved = reviews.filter((request) => request.status === "approved" && request.proofMode !== "promo");
  const sum = (items, field) => items.reduce((total, item) => {
    const value = Number(item[field]);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
  const payoutOf = (items) => items.reduce((total, record) => {
    const value = record.cardConversionValue ?? Math.floor(Number(record.cardValue || record.tokenCost || 0) * 0.8);
    return total + (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0);
  }, 0);
  const payoutTokens = payoutOf(settled);
  return {
    totalUserCount,
    newUserCount,
    purchaseCount: purchases.length,
    buyerCount: new Set(purchases.map((record) => record.uid).filter(Boolean)).size,
    salesTokens: sum(purchases, "tokenCost"),
    settledSalesTokens: sum(settled, "tokenCost"),
    payoutTokens,
    unsettledCount: purchases.length - settled.length,
    instantCount: instant.length,
    instantBuyerCount: new Set(instant.map((record) => record.uid).filter(Boolean)).size,
    instantSalesTokens: sum(instant, "tokenCost"),
    instantPayoutTokens: payoutOf(instant),
    instantHeavenCount: instant.filter((record) => record.resultSide === "heaven").length,
    approvedPaymentCount: approved.length,
    approvedHkd: sum(approved, "verifiedHkdAmount"),
  };
}
