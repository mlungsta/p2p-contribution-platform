# Matching Rules (Draft)

Implemented hardened batch matching behavior:

- Batch-based processing only, no instant matching by default.
- Accumulation-window gating before normal matching.
- Transactional execution with DB transaction boundaries.
- Row-level locking strategy via `FOR UPDATE SKIP LOCKED` where supported.
- Active-match check is evaluated inside transaction.
- One active match per payer enforced.
- Suspended/restricted users are skipped.
- Users with unresolved disputes are skipped.
- Partial matching is supported.
- Recipient request lifecycle supports:
  - CREATED
  - WAITING_FOR_POOL
  - ACTIVE
  - PARTIALLY_MATCHED
  - FULLY_MATCHED
  - EXPIRED
  - CANCELLED
  - DISPUTED
- Idempotency is enforced using `batch_run_id` and `idempotency_key`.
- Match uniqueness is enforced with unique references and unique batch-offer-request tuple.
- Admin override requires reason and permission.
- Audit events include actor, role, trigger source, correlation id, batch run id, and affected entity references.

Explicitly forbidden and rejected:
- guaranteed ROI
- hidden payout rotation
- referral rewards payouts
- wallet custody
