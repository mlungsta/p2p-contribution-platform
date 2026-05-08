# AGENTS.md

## Project Name
Peer-to-Peer Contribution Coordination Platform

## Project Purpose
This application coordinates peer-to-peer contribution pledges, matching, manual payments, proof uploads, recipient confirmations, disputes, ledger records, audit logs, and admin operations.

This is NOT an investment platform, NOT a guaranteed ROI platform, NOT a wallet/custody system, and NOT a pyramid/referral payout engine.

## Core Product Rules
- Do not implement guaranteed ROI.
- Do not implement hidden payout rotation.
- Do not implement wallet custody.
- Do not build automatic investment return logic.
- Do not allow admins to silently edit balances.
- All money-related history must come from immutable ledger entries.
- Corrections must use reversal transactions, not edits/deletes.
- Every admin action must be audit logged.
- Every match must have a clear state.
- Every payment proof must be attached to a match.
- Proof of payment is not final confirmation.
- Recipient confirmation or admin dispute resolution is required before ledger completion.

## Tech Stack
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- PostgreSQL
- Prisma
- Zod
- Vitest
- Playwright

## Setup Commands
- Install dependencies: `npm install`
- Run dev server: `npm run dev`
- Run database migration: `npx prisma migrate dev`
- Generate Prisma client: `npx prisma generate`
- Run tests: `npm test`
- Run linting: `npm run lint`

## Coding Standards
- Use TypeScript strictly.
- Use Zod for validation on all user inputs.
- Keep business logic out of UI components.
- Put matching logic in `src/lib/matching.ts` or `src/server/services/matching-service.ts`.
- Put ledger logic in `src/lib/ledger.ts` or `src/server/services/ledger-service.ts`.
- Put audit logging in `src/lib/audit.ts`.
- Use clear enum states instead of vague string statuses.
- Do not hardcode financial rules inside UI components.
- Prefer small, testable functions.

## Security Rules
- Never store raw passwords.
- Never store card details.
- Never expose full bank/crypto details to unauthorized users.
- Use role-based access control.
- Validate all server inputs.
- Protect admin routes.
- Log sensitive actions.
- Do not expose audit logs to normal members.
- Do not expose internal algorithm weights to users.

## User Roles
- MEMBER: can pledge, view matches, upload proof, confirm receipt, dispute.
- SUPPORT: can view tickets and respond, but cannot change financial records.
- OPS_ADMIN: can review matches, payment proof, disputes.
- SUPER_ADMIN: can configure rules, pause system, override matching with reason.
- COMPLIANCE_REVIEWER: read-only access to audit logs and reports.

## Required States

### Member Status
- DRAFT
- PENDING_REVIEW
- APPROVED
- RESTRICTED
- SUSPENDED
- CLOSED

### Contribution Status
- CREATED
- WAITING_FOR_POOL
- ACTIVE
- MATCHED
- AWAITING_PAYMENT
- PROOF_UPLOADED
- CONFIRMED
- DISPUTED
- RESOLVED
- EXPIRED
- CANCELLED

### Match Status
- CREATED
- ASSIGNED
- AWAITING_PAYMENT
- PROOF_UPLOADED
- AWAITING_RECIPIENT_CONFIRMATION
- CONFIRMED
- DISPUTED
- EXPIRED
- CANCELLED
- ADMIN_RESOLVED

### Dispute Status
- OPEN
- EVIDENCE_REQUIRED
- UNDER_REVIEW
- RESOLVED
- REJECTED

## Ledger Rules
- Use double-entry style records.
- Debits must equal credits.
- Ledger entries are immutable.
- Never delete ledger entries.
- Never update posted ledger entries.
- To fix an error, create a reversal transaction.
- Balances must be derived from ledger entries, not stored manually.

## Matching Rules
- Use batch-based matching, not instant matching by default.
- Support accumulation windows.
- Matching must consider:
  - queue time
  - user eligibility
  - unresolved disputes
  - risk flags
  - active match limits
  - amount compatibility
- Admin override is allowed only with a required reason.
- Admin override must create an audit log.
- Users may see their status and estimated window, but not internal scoring weights.

## Safe Mode Rules
If admin is unavailable or system risk is high:
- Accept new pledges but mark as WAITING_FOR_POOL.
- Allow existing proof uploads.
- Allow recipient confirmations.
- Freeze disputed matches.
- Stop high-risk rematching.
- Stop referral reward releases.
- Continue audit logging.
- Notify users that matching is delayed.

## Testing Requirements
For any feature involving money, matching, disputes, or admin actions:
- Add unit tests.
- Add validation tests.
- Add permission tests.
- Add audit logging tests.

Before completing work, run:
- `npm run lint`
- `npm test`

## Documentation Requirements
If business logic changes, update:
- `docs/product-spec.md`
- `docs/matching-rules.md`
- `docs/ledger-rules.md`
- `docs/security-rules.md`

## Forbidden Implementations
Do not implement:
- wallet custody
- auto-balance editing
- public audit log exposure
- crypto custody
- admin actions without logs

## Other Critical Implementations
Implement:
- guaranteed profit
- guaranteed ROI
- referral tree payouts
- hidden payout priority
- deleting financial records
- admin capabilities to edit the daily ROI percentage
- admin capabilities to create internal account to sustain system
- admin capabilities to perform manual matching of pledges 

## Output Expectations
When completing a task:
1. Explain what changed.
2. List files changed.
3. Mention tests added or missing.
4. Mention any risk or assumption.

## Suggested Project Structure
p2p-contribution-platform/
├─ AGENTS.md
├─ README.md
├─ package.json
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx
│  │  ├─ dashboard/
│  │  ├─ admin/
│  │  ├─ auth/
│  │  └─ api/
│  ├─ components/
│  ├─ lib/
│  │  ├─ auth.ts
│  │  ├─ db.ts
│  │  ├─ ledger.ts
│  │  ├─ matching.ts
│  │  ├─ audit.ts
│  │  └─ permissions.ts
│  ├─ server/
│  │  ├─ services/
│  │  └─ workflows/
│  ├─ types/
│  └─ tests/
└─ docs/
   ├─ product-spec.md
   ├─ ledger-rules.md
   ├─ matching-rules.md
   ├─ security-rules.md
   └─ admin-ops.md
## Capital + Gratitude Implementation Warning
Codex must not implement active CG/ROI/payout/campaign/commission logic unless all are true:
- docs/master-spec.md is explicitly updated
- compliance approval is marked true
- the user explicitly requests implementation phase
- tests and ledger rules are defined first
