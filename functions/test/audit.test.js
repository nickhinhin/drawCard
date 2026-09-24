import test from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { auditChanges, auditEntry, auditValue, AUDIT_TYPE } from "../src/audit.js";

function snapshot(path, data) {
  return { exists: Boolean(data), data: () => data, ref: { path } };
}

test("audit records only changed fields with before and after values", () => {
  const changes = auditChanges(
    { tokens: 1545, username: "NANI", updatedAt: Timestamp.fromMillis(0) },
    { tokens: 405, username: "NANI", lastPurchaseRecordId: "r1", updatedAt: Timestamp.fromMillis(1000) },
  );
  assert.deepEqual(Object.keys(changes), ["lastPurchaseRecordId", "tokens", "updatedAt"]);
  assert.deepEqual(changes.tokens, { before: 1545, after: 405 });
  assert.deepEqual(changes.lastPurchaseRecordId, { before: null, after: "r1" });
  assert.equal(changes.updatedAt.after, "1970-01-01T00:00:01.000Z");
});

test("audit trims long strings and large arrays", () => {
  assert.match(auditValue("x".repeat(1000)), /…\(1000 chars\)$/);
  const list = auditValue(Array.from({ length: 80 }, (_, index) => index));
  assert.equal(list.length, 51);
  assert.equal(list.at(-1), "…(80 items)");
});

test("audit entry captures operation, path, collection and who made the change", () => {
  const path = "draws/d1/rounds/round-001/slots/7";
  const entry = auditEntry({
    id: "evt1",
    time: "2026-09-24T00:00:00Z",
    authType: "app_user",
    authId: "uid-123",
    data: { before: snapshot(path, { status: "available" }), after: snapshot(path, { status: "locked", uid: "uid-123" }) },
  });
  assert.equal(entry.auditType, AUDIT_TYPE);
  assert.equal(entry.operation, "update");
  assert.equal(entry.collection, "draws/rounds/slots");
  assert.equal(entry.authId, "uid-123");
  assert.deepEqual(entry.changes.status, { before: "available", after: "locked" });

  const deleted = auditEntry({ id: "evt2", authType: "service_account", authId: "owner@example.com", data: { before: snapshot("users/u1", { tokens: 5 }), after: snapshot("users/u1", null) } });
  assert.equal(deleted.operation, "delete");
  assert.deepEqual(deleted.changes.tokens, { before: 5, after: null });
});

test("edits beyond the display trimming are still detected", () => {
  const base = "x".repeat(400);
  const changes = auditChanges({ note: `${base}a` }, { note: `${base}b` });
  assert.ok(changes.note, "a change after character 300 must be logged");
  const list = Array.from({ length: 60 }, (_, index) => index);
  assert.ok(auditChanges({ items: list }, { items: [...list.slice(0, 55), 999, ...list.slice(56)] }).items);
});
