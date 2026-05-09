# Client Demo Script

## Opening Explanation
- This platform coordinates peer-to-peer contribution commitments.
- Funds move outside the platform through manual payment rails.
- The system records lifecycle state, proofs, disputes, ledger/audit history, and role-governed admin actions.
- This is not a wallet, not a guaranteed-return platform, and not an automated payout engine.

## Member Journey
1. Open `/auth` and sign in as a member demo account.
2. Confirm redirect to `/dashboard` and review live metrics:
   - contributions made
   - contributions received
   - pending matches
3. Open `Create Offer / Request` and submit:
   - a contribution offer
   - a recipient request
4. Open `My Matches` and upload proof metadata.
5. Explain clearly: proof upload is evidence only, not confirmation.
6. Open `Open Dispute` and submit a dispute on an eligible match.
7. Open `My History` to review lifecycle progression.

## Admin Journey
1. Sign in as super admin and confirm redirect to `/admin`.
2. Review live operational metrics:
   - member count
   - active offers
   - active requests
   - active matches
   - open disputes
   - safe mode state
3. Open `Matching Queue` and run a batch.
4. Open `Disputes` and resolve an open dispute.
5. Open `Audit Logs` and load recent actions.
6. Demonstrate force logout action and explain reason/audit requirement.

## Safe Mode Explanation
- Show safe mode state on admin dashboard and safe mode panel.
- Explain behavior when safe mode is enabled:
  - new offers accepted as waiting for pool
  - proof uploads/confirmations continue
  - high-risk matching/override actions restricted

## Dispute Flow Explanation
- Trigger: payment disagreement or proof concerns.
- Lifecycle: OPEN -> EVIDENCE_REQUIRED -> UNDER_REVIEW -> RESOLVED/CLOSED.
- Dispute actions are role-protected and audit logged.

## CG Calculator Explanation
- Open `/dashboard/cg-calculator`.
- Show inputs:
  - contribution amount (minor units)
  - daily projected gratitude %
  - maturity days
- Show outputs:
  - projected gratitude
  - projected total
  - projected maturity date
- Emphasize disclaimer: estimate only, not guaranteed.

## Intentionally Not Active Yet
- No active CG payout engine.
- No guaranteed ROI logic.
- No referral rewards distribution.
- No wallet balances or custody.
- No hidden payout rotation.
