# MASTER SPECIFICATION
## Peer-to-Peer Contribution Coordination Platform (P2P-CCP)

---

## 1. PURPOSE

This system coordinates peer-to-peer contribution commitments between members.

The platform:
- DOES NOT custody funds
- DOES NOT guarantee ROI
- DOES NOT operate as a financial institution

The platform:
- records contribution intent
- matches participants
- tracks payment confirmations
- manages disputes
- maintains audit logs

---

## 2. NON-NEGOTIABLE CONSTRAINTS

2. No wallet/custody system
3. No editable balances
4. All financial records are immutable
5. Corrections use reversal entries only
6. All admin actions must be audit logged
7. Matching must be explainable at user level
8. System must operate safely without admin for 48 hours
9. Matching must be idempotent
10. System must be concurrency-safe

---

## 3. ROLES

- MEMBER
- SUPPORT
- OPS_ADMIN
- SUPER_ADMIN
- COMPLIANCE_REVIEWER

---

## 4. CORE MODULES

### 4.1 User System
Handles registration, authentication, roles, and status.

### 4.2 Contribution Offers
User pledges amount to contribute.

Fields:
- id
- user_id
- amount_minor (integer)
- status
- created_at
- expires_at

States:
- CREATED
- WAITING_FOR_POOL
- ACTIVE
- MATCHED
- EXPIRED
- CANCELLED

---

### 4.3 Recipient Requests
User requests to receive contributions.

States:
- CREATED
- WAITING_FOR_POOL
- ACTIVE
- PARTIALLY_MATCHED
- FULLY_MATCHED
- EXPIRED
- CANCELLED
- DISPUTED

---

### 4.4 Matching Engine

Type: Batch-based (accumulate & distribute)

Rules:
- FIFO base ordering
- Skip suspended/restricted users
- Skip users with unresolved disputes
- One active match per payer
- Allow partial matching
- Must be idempotent

---

## 5. MATCH LIFECYCLE

States:
- CREATED
- ASSIGNED
- AWAITING_PAYMENT
- PROOF_UPLOADED
- AWAITING_CONFIRMATION
- CONFIRMED
- DISPUTED
- RESOLVED
- EXPIRED
- CANCELLED
- COMPLETED

---

## 6. PAYMENT FLOW (MANUAL ONLY)

1. Match assigned
2. Payer pays externally (EFT/crypto)
3. Payer uploads proof
4. Recipient confirms OR disputes
5. Ledger entry created

Proof of payment ≠ confirmation.

---

## 7. LEDGER SYSTEM

Requirements:
- Double-entry structure
- Immutable records
- No update/delete after posting
- Reversal entries for corrections

Example:
- Debit: payer_contribution_given
- Credit: recipient_contribution_received

Balances must be derived, not stored.

---

## 8. AUDIT LOGGING

Every action must log:

- actor_id
- actor_role
- action
- entity_type
- entity_id
- before_state
- after_state
- reason (if applicable)
- correlation_id
- batch_run_id
- timestamp

Audit logs are not publicly accessible.

---

## 9. MATCHING ENGINE REQUIREMENTS

### 9.1 Concurrency Safety
- Use DB transactions
- Use row-level locking (SELECT ... FOR UPDATE SKIP LOCKED)
- Prevent duplicate matching across workers

### 9.2 Idempotency
- Each batch must have batch_run_id
- Re-running batch must not duplicate matches
- Unique constraint on match references

### 9.3 Monetary Precision
- Use integer minor units only (e.g. cents)
- No floating point usage

### 9.4 Admin Override
- Allowed only for SUPER_ADMIN or matching:override permission
- Must include reason
- Must be audit logged

---

## 10. SAFE MODE (AUTONOMOUS OPERATION)

When admin unavailable:

System must:
- Accept new offers (WAITING_FOR_POOL)
- Accept proof uploads
- Allow confirmations
- Freeze disputed matches
- Delay new matching cycles if unsafe
- Disable risky overrides
- Continue audit logging

---

## 11. DISPUTE SYSTEM

Triggers:
- Payer claims paid, recipient denies
- Wrong amount
- Fake proof
- Payment issues

Flow:
- OPEN
- EVIDENCE_REQUIRED
- UNDER_REVIEW
- RESOLVED
- CLOSED

Disputes block further matching for involved users.

---

## 12. ADMIN CAPABILITIES

Admin CAN:
- Approve users
- Trigger batch matching
- Resolve disputes
- Pause system
- Override matches (with reason)

Admin CANNOT:
- Edit balances
- Bypass audit logs
- Reorder users secretly

---

## 13. TEST REQUIREMENTS

Must include:

1. Concurrency test (multiple workers)
2. Idempotency test (retry safe)
3. Partial matching test
4. Suspended user exclusion test
5. Dispute blocking test
6. Ledger invariant test (debits == credits)
7. Override permission test

---

## 14. INFRASTRUCTURE

Database:
- PostgreSQL only

Required features:
- Transactions
- Row-level locking
- Unique constraints

---

## 15. FORBIDDEN FEATURES

- ROI engine
- Guaranteed payouts
- Hidden rotation logic
- Pyramid/referral payout systems (future only with review)
- Wallet balances
- Crypto custody
- Silent admin manipulation

---

## 16. CODING DIRECTIVES

1. Follow this document strictly
2. Do not infer missing behavior
3. Stop and ask if ambiguous
4. Prioritize correctness over speed
5. Prioritize safety over convenience

## 17. OTHER KEY FEATURES

- ROI engine
- Guaranteed payouts
- Hidden rotation logic
- Pyramid/referral payout systems
- Wallet balances
- Crypto custody
- Silent admin manipulation