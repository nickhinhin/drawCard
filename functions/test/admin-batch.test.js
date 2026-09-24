import test from "node:test";
import assert from "node:assert/strict";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { __test } from "../src/index.js";

test("admin batch accepts room round slot paths and dotted update keys", () => {
  const slot = __test.adminBatchOperation({
    path: "draws/room-1/rounds/round-001/slots/7", mode: "set", data: { status: "available" },
  });
  assert.equal(slot.ref.path, "draws/room-1/rounds/round-001/slots/7");
  const update = __test.adminBatchOperation({
    path: "draws/room-1", mode: "update", data: { "roundResultSides.round-001": { 1: "heaven" } },
  });
  assert.deepEqual(update.data, { "roundResultSides.round-001": { 1: "heaven" } });
});

test("admin batch rejects user-owned paths, dotted non-updates and permanent deletes", () => {
  assert.throws(() => __test.adminBatchOperation({ path: "users/abc", data: { tokens: 1 } }), /不可/);
  assert.throws(() => __test.adminBatchOperation({ path: "tokenRequests/abc", data: {} }), /不可/);
  assert.throws(() => __test.adminBatchOperation({ path: "draws/a/messages/b", mode: "delete" }), /不可/);
  assert.throws(() => __test.adminBatchOperation({ path: "draws/a", mode: "set", data: { "a.b": 1 } }), /欄位名稱/);
  assert.throws(() => __test.adminBatchOperation({ path: "cards/a", mode: "delete" }), /不可永久刪除/);
  assert.throws(() => __test.adminBatchOperation({ path: "drawRecords/a", data: { tokenCost: 0 } }), /財務欄位/);
});

test("admin batch keeps the Mac collection/documentId format", () => {
  const operation = __test.adminBatchOperation({ collection: "cards", documentId: "c1", data: { name: "Card" } });
  assert.equal(operation.mode, "upsert");
  assert.equal(operation.ref.path, "cards/c1");
});

test("admin values decode server timestamps and dates", () => {
  const decoded = __test.decodeAdminValue({
    at: { __adminServerTimestamp: true },
    nested: { when: { __adminTimestampMillis: 1_700_000_000_000 } },
  });
  assert.ok(decoded.at.isEqual(FieldValue.serverTimestamp()));
  assert.ok(decoded.nested.when instanceof Timestamp);
  assert.equal(decoded.nested.when.toMillis(), 1_700_000_000_000);
});

test("dotted field paths are limited to room result maps", () => {
  for (const data of [
    { "uid.x": "attacker" }, { "tokenCost.y": 0 }, { "convertedToTokens.z": 1 }, { "createdAt.a": 1 },
  ]) {
    assert.throws(() => __test.adminBatchOperation({ path: "drawRecords/r1", mode: "update", data }), /欄位名稱/);
  }
  assert.throws(() => __test.adminBatchOperation({ path: "cards/c1", mode: "update", data: { "tokenValue.v": -5 } }), /欄位名稱/);
  assert.throws(() => __test.adminBatchOperation({ path: "promoCodes/P-1", mode: "update", data: { "amount.v": 1 } }), /欄位名稱/);
  assert.throws(() => __test.adminBatchOperation({ path: "draws/d1", mode: "update", data: { "status.s": "x" } }), /欄位名稱/);
  assert.throws(() => __test.adminBatchOperation({ path: "settings/tokenPackages", mode: "update", data: { "packages.0": {} } }), /欄位名稱/);
  assert.throws(() => __test.adminBatchOperation({ path: "draws/d1", mode: "update", data: { "roundResultSides.a.b": "x" } }), /欄位名稱/);
  assert.doesNotThrow(() => __test.adminBatchOperation({ path: "draws/d1", mode: "update", data: { "roundResultImages.round-001": "https://x" } }));
});
