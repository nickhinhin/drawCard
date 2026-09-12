# LiveDraw Security Audit

Date: 2026-09-04

## Executive Result

**Not safe to describe as fully secured.** Against the current local Firestore rules, six unauthorized scenarios succeeded in an isolated emulator. Five control scenarios behaved as expected. No real user balances, cards, payments, permissions, or deployed rules were changed.

This proves flaws in the checked-out rules, not that the exact same rules are currently deployed. Deployed rules must be compared before asserting live exploitability. The existing working tree already contained changes before this audit.

## Scope and Method

- Local Firebase Auth and Firestore emulators only, project `demo-drawcard-security`.
- Synthetic ordinary user, 100 starting tokens, synthetic room/cards/slots.
- Attacker calls the database directly using an ordinary authenticated client; frontend controls are intentionally bypassed.
- Seed access is used only for isolated test setup. Every tested attack is executed through the ordinary user's Firebase SDK connection with security rules enforced.
- Test script refuses to run unless both emulator endpoints match the dedicated localhost ports.
- Production traffic, real purchases, SMS, live payment submissions, destructive changes, denial-of-service, and third-party services were not tested.

## Confirmed Findings

### Critical: Forged Award Records Can Mint Tokens

Location: `firestore.rules`, `isMatchingRoundDrawRecord()` (line 265), `isCardConversionUserEdit()` (line 181), and `drawRecords` create rule (line 602).

The purchase-record create check matches only selected fields to an owned slot. It does not restrict additional fields, require a newly purchased slot, or prevent duplicate records. An ordinary user can include awarded-card and conversion fields in a new record. The balance-update rule accepts this newly created record as refund evidence.

Observed: a forged record with a 999,999-token refund and the corresponding user balance update were accepted together. No administrator assigned this synthetic award.

Remediation: allowlist player-created record fields, exclude every award/refund/shipping field, require an actual slot transition in the same transaction, bind a unique record ID to each purchase, and move awards/refunds to an authoritative server transaction.

### Critical: Previously Converted Cards Can Be Refunded Again

Location: `firestore.rules`, `isCardConversionUserEdit()` (line 181).

The rule checks the record's after-state, but does not require the before-state to be unconverted or the record to change in the current transaction.

Observed: the same already-converted record was accepted for two successive balance increases, from 100 to 180 and then 260, without any record update.

Remediation: require before/after conversion transition and matching timestamps/owner/value in one atomic operation. Make refund processing idempotent on the server with a unique ledger entry.

### High: Multiple Slots Can Share a Single Debit

Location: `firestore.rules`, `isValidSlotPurchase()` (line 211), and `isTokenSpend()`.

Each slot validates the same user before/after balance difference independently. Two equal-price slots in one batch can both reuse that one debit.

Observed: two 10-token slots were locked while the balance fell from 100 to only 90, rather than 80.

Remediation: use an authoritative purchase transaction that sums all purchased slots. Alternatively, enforce one uniquely identified purchase/slot per client transaction with reciprocal immutable references, rather than a shared unbound balance difference.

### High: Shipped Cards Can Still Be Converted to Tokens

Location: `firestore.rules`, `isCardTokenConversion()` (line 321).

The UI restricts conversions to pending cards, but database rules do not require the previous collection status to be pending or reject requested/shipped cards.

Observed: an already-shipped card was changed to converted and credited 80 tokens.

Remediation: enforce pending-only eligibility in database/server logic and make shipping and conversion mutually exclusive atomic transitions.

### High: Room Pricing Can Be Bypassed by a Cheaper Global Card Price

Location: `firestore.rules`, `isValidSlotPurchase()` (line 211).

The price check allows the room price OR the global card price, even when a room-specific price exists.

Observed: a room priced at 100 tokens accepted a 10-token purchase because the global card price was 10.

Remediation: require the authoritative room price when present; use a fallback only when the room has no configured price. Do not let the client choose the cheaper authority.

### High, Requires Admin Approval: Inflated Token Applications

Location: `firestore.rules`, `isValidTokenRequestCreate()` (line 416); `src/App.jsx`, `approveRequest()` (around line 3643).

The request's token amount is not validated against its payment amount or configured package. Any nonempty promotion code can create a pending request. Approval then credits the stored client-supplied amount and uses the supplied deposit amount for VIP calculations.

Observed: a pending application requesting 1,000,000 tokens for HK$500 with an invented promotion code was accepted. This test did NOT auto-credit tokens or approve the application.

Remediation: calculate grants server-side from a verified payment/package or valid single-use promotion; verify claimed deposits independently; do not trust request amounts. Until fixed, administrators must manually verify both the actual receipt and the token amount before approving.

## Test Results

| Scenario | Required behavior | Observed |
| --- | --- | --- |
| Normal single-slot purchase | Allow | Allowed |
| Self-promote to administrator | Deny | Denied |
| Direct token balance increase | Deny | Denied |
| Read another user's private profile | Deny | Denied |
| Ordinary user changes platform payment settings | Deny | Denied |
| Reuse an already-converted record for refunds | Deny | Allowed |
| Convert an already-shipped card | Deny | Allowed |
| Buy two slots for one debit | Deny | Allowed |
| Forge award/refund record and increase balance | Deny | Allowed |
| Pay global price instead of higher room price | Deny | Allowed |
| Inflated token request with invented promotion | Deny | Allowed as pending |

## Other Risks and Limits

- Beta is not a separate security boundary: `.env.beta` sets only the app variant, while `src/firebase.js` defaults to the production Firebase project. Beta and production hosting share Auth/Firestore/Storage unless separately configured. No shared-rule deployment was performed in this audit.
- Public room/slot reads expose the fields stored in those documents, including buyer username/UID and target-card details. Decide whether that disclosure is intended; private fields should live separately.
- Storage upload and token-request creation lack an evident per-user quota in the reviewed rules. Abuse/cost testing was not performed.
- No live deployed-rule comparison, dependency vulnerability scan, exhaustive XSS review, authentication/SMS abuse assessment, Storage emulator tests, or admin-account compromise simulation was performed. This is not a claim of complete coverage.
- Some existing happy-path permission tests do not test malicious transactions. Successful normal workflows do not prove financial invariants are secure.

## Recommended Priority

1. Immediately plan containment for player-side refunds and forged award creation. Disabling UI buttons alone is not sufficient.
2. Fix and regression-test all financial invariants above, including valid purchases, refunds, shipping, admin assignments, and historical records.
3. Compare deployed rules and arrange a controlled shared-rules rollout. Expect impact on both Beta and production until environments are isolated.
4. Reconcile historical refund/award/purchase data for duplicates or inconsistent values. This audit did not establish that real exploitation occurred.
5. Separate Beta data/services from production, add audit ledgers and alerting, then expand security coverage.

## Reproduce Locally

```sh
firebase emulators:exec --project demo-drawcard-security --config firebase.security-audit.json --only auth,firestore "node scripts/security-audit.mjs"
```

The script reports expected versus observed access decisions. It is an audit harness: currently unsafe scenarios are printed explicitly; successful script execution means the audit ran, not that the application passed security review.

## Changes Made in This Audit

Added the localhost-only audit harness, isolated emulator configuration, and this report. No application logic, access rules, real data, or deployments were changed.
