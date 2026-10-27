import test from "node:test";
import assert from "node:assert/strict";
import { assertShippableUpdate, isClosedCardRecord } from "../src/index.js";

test("converted or voided cards are closed", () => {
  assert.equal(isClosedCardRecord({ convertedToTokens: true }), true);
  assert.equal(isClosedCardRecord({ collectionStatus: "converted" }), true);
  assert.equal(isClosedCardRecord({ collectionStatus: "void" }), true);
  assert.equal(isClosedCardRecord({ collectionStatus: "pending" }), false);
  assert.equal(isClosedCardRecord({}), false);
});

test("admin writes cannot move a converted or voided card into shipping", () => {
  for (const before of [{ convertedToTokens: true, collectionStatus: "converted" }, { collectionStatus: "void" }]) {
    for (const data of [{ collectionStatus: "shipping" }, { collectionStatus: "shipped" }, { deliveryStatus: "in_transit" }, { shippingRequested: true }]) {
      assert.throws(() => assertShippableUpdate("drawRecords", before, data), /不可配送/);
    }
  }
  // Pending cards ship as before; other fields and other collections are untouched.
  assert.doesNotThrow(() => assertShippableUpdate("drawRecords", { collectionStatus: "pending" }, { collectionStatus: "shipping" }));
  assert.doesNotThrow(() => assertShippableUpdate("drawRecords", { collectionStatus: "void" }, { adminNote: "x" }));
  assert.doesNotThrow(() => assertShippableUpdate("cards", { collectionStatus: "void" }, { collectionStatus: "shipping" }));
  assert.doesNotThrow(() => assertShippableUpdate("drawRecords", null, { collectionStatus: "shipping" }));
});

test("取消配送 only applies to a request still in delivery", () => {
  const cancel = { collectionStatus: "pending", deliveryStatus: "cancelled", shippingCancelled: true };
  for (const before of [
    { collectionStatus: "shipping", shippingRequested: true },
    { collectionStatus: "shipping", shippingRequested: true, deliveryStatus: "in_transit", trackingNumber: "SF1" },
  ]) {
    assert.doesNotThrow(() => assertShippableUpdate("drawRecords", before, cancel));
  }
  // Delivered (possibly from a stale admin page), never requested, or already back in pending.
  for (const before of [
    { collectionStatus: "shipped", shippingRequested: true, deliveryStatus: "delivered" },
    { collectionStatus: "pending" },
    { collectionStatus: "pending", shippingRequested: true, shippingCancelled: true },
  ]) {
    assert.throws(() => assertShippableUpdate("drawRecords", before, cancel), /只可取消/);
  }
  // Clearing the flag on dispatch or delivery is always allowed.
  assert.doesNotThrow(() => assertShippableUpdate("drawRecords", { collectionStatus: "shipping", shippingRequested: true }, { shippingCancelled: false, deliveryStatus: "in_transit" }));
});
