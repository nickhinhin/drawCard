// A Hong Kong calendar day is a fixed 24-hour UTC interval (Hong Kong has no DST).
export function analyticsDayRange(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return null;
  const start = new Date(`${day}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime()) || day !==
    new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

// Purchase-day margin uses the recorded token cost and settled card conversion value.
export function summarizeAdminDay(records, reviews, newUserCount, totalUserCount) {
  const purchases = records.filter((record) => Number(record.tokenCost) > 0);
  const settled = purchases.filter((record) => Boolean(record.cardId));
  const approved = reviews.filter((request) => request.status === "approved" && request.proofMode !== "promo");
  const sum = (items, field) => items.reduce((total, item) => {
    const value = Number(item[field]);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
  const payoutTokens = settled.reduce((total, record) => {
    const value = record.cardConversionValue ?? Math.floor(Number(record.cardValue || record.tokenCost || 0) * 0.8);
    return total + (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0);
  }, 0);
  return {
    totalUserCount,
    newUserCount,
    purchaseCount: purchases.length,
    buyerCount: new Set(purchases.map((record) => record.uid).filter(Boolean)).size,
    salesTokens: sum(purchases, "tokenCost"),
    settledSalesTokens: sum(settled, "tokenCost"),
    payoutTokens,
    unsettledCount: purchases.length - settled.length,
    approvedPaymentCount: approved.length,
    approvedHkd: sum(approved, "verifiedHkdAmount"),
  };
}
