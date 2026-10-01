import test from "node:test";
import assert from "node:assert/strict";
import { buildDepositEmail } from "../src/deposit-email.js";

const at = new Date("2026-10-01T14:46:08Z");

test("入金 requests produce an email with the key details in Hong Kong time", () => {
  const email = buildDepositEmail("req1", { proofMode: "storage", username: "Ching1996", hkdAmount: 30000, amount: 35100, duplicateProofRequestIds: [] }, at);
  assert.equal(email.subject, "新入金申請：Ching1996 HK$30,000");
  assert.match(email.text, /會員：Ching1996/);
  assert.match(email.text, /代幣：35,100/);
  assert.match(email.text, /2026.*22:46:08（香港時間）/);
  assert.match(email.text, /申請編號：req1/);
  assert.doesNotMatch(email.text, /重複|相同/);
});

test("promo redemptions do not send an email", () => {
  assert.equal(buildDepositEmail("req2", { proofMode: "promo", username: "a", amount: 50 }, at), null);
  assert.equal(buildDepositEmail("req3", undefined, at), null);
});

test("reused payment proofs are flagged and player text is escaped in HTML", () => {
  const email = buildDepositEmail("req4", { proofMode: "storage", username: "<b>x</b>", hkdAmount: 500, amount: 515, duplicateProofRequestIds: ["a", "b"] }, at);
  assert.equal(email.subject, "【重複證明】新入金申請：<b>x</b> HK$500");
  assert.match(email.text, /另外 2 個申請/);
  assert.match(email.html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(email.html, /<b>x<\/b>/);
});
