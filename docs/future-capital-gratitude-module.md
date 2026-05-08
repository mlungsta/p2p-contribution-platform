# Future Capital + Gratitude (CG) Module

Status: Documentation only. Not approved for implementation.

## 1. Business Concept
- Member contributes amount.
- Once payment is confirmed, CG accrual timer begins.
- CG accrues at admin-configured daily rate, e.g. 0.05% per day.
- Maturity occurs after admin-configured period, e.g. 30 days.
- Member may request withdrawal after maturity.
- Withdrawal is Capital + projected Gratitude.
- Payout depends on available future member pledges/partial matches.
- CG is projected, not guaranteed.

## 2. Required Future Controls Before Implementation
- Legal/compliance approval flag.
- Admin-configured CG rules.
- Rule effective dates.
- No mid-cycle rule changes.
- Per-cycle immutable rule snapshot.
- Maximum daily CG cap.
- Maximum maturity period.
- Liquidity/backlog controls.
- User disclaimer acceptance.
- Full audit logging.
- Reporting/export controls.
- Abuse/fraud controls.
- Admin override logging.

## 3. Required New Models If Later Approved
- cg_rules
- cg_obligations
- cg_accrual_snapshots
- withdrawal_requests
- liquidity_batches
- campaign_rules
- campaign_points
- commission_events

## 4. Required State Machines
### CG Obligation States
- CREATED
- ACCRUING
- MATURED
- WITHDRAWAL_REQUESTED
- PARTIALLY_MATCHED
- PAID
- DELAYED
- CANCELLED
- FORCE_MAJEURE

### Withdrawal States
- REQUESTED
- QUEUED
- PARTIALLY_MATCHED
- AWAITING_PAYMENT
- PROOF_UPLOADED
- CONFIRMED
- DISPUTED
- COMPLETED
- DELAYED

## 5. Forbidden Until Compliance Approval
- automatic CG payouts
- guaranteed maturity payouts
- referral/commission cash conversion
- games converting directly to withdrawable cash
- forced system restart logic
- hidden payout prioritization
- admin changing CG rules mid-cycle

## 6. Calculator Specification Only
- contribution amount
- daily CG percentage
- maturity days
- projected CG amount
- projected total CG
- projected maturity date
- disclaimer: estimate only, not guarantee

## 7. Implementation Gate (Mandatory)
This module remains documentation-only until all of the following are true:
- docs/master-spec.md is explicitly updated
- compliance approval is marked true
- implementation phase is explicitly requested by the user
- tests and ledger rules are defined first

Scope guard:
- Do not implement active payout logic.
- Do not implement ROI logic.
- Do not implement referral rewards.
- Do not implement wallet balances.
- Do not change existing matching or ledger behavior as part of this future module.
