import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "../src/index.js";

test("csvSet trims and removes empty values", () => {
  assert.deepEqual([...__test.csvSet(" a, b ,,a ")], ["a", "b"]);
});

test("plainData rejects prototype keys", () => {
  assert.throws(() => __test.plainData({ constructor: "x" }), /欄位名稱/);
});

test("validatedDocumentData rejects arrays", () => {
  assert.throws(() => __test.validatedDocumentData([]), /文件資料/);
});

test("verifiedTokenGrant rejects inflated paid requests", () => {
  assert.throws(() => __test.verifiedTokenGrant({
    proofMode: "storage", proofUrl: "https://example.test/proof", hkdAmount: 500,
    amount: 999999, exchangeRate: 1999.998, packageType: "preset",
  }, 500, { rateVersion: 2, packages: [{ hkd: 500, tokens: 525 }] }), /套餐價格/);
});

test("verifiedTokenGrant validates promo and redemption together", () => {
  const request = {
    uid: "u1", proofMode: "promo", promoCode: "BONUS-525", promoCodeId: "BONUS-525",
    packageType: "promo", hkdAmount: 0, amount: 525, exchangeRate: 0,
  };
  assert.equal(__test.verifiedTokenGrant(
    request, 0,
    null,
    { active: true, code: "BONUS-525", amount: 525 },
    { uid: "u1", requestId: "r1" },
    "r1",
  ), 525);
});
