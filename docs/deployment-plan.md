# Deployment Plan

Status: Controlled release plan for staging and production.

## 1. Environments
- Development: local iteration only.
- Staging: production-like config, isolated DB, full regression and E2E.
- Production: customer-facing, strict change controls.

### Required Environment Separation
- `APP_ENV=development|test|staging|production`
- `NODE_ENV=development|test|production` (must align with `APP_ENV`)
- `NEXT_PUBLIC_APP_ENV` must equal `APP_ENV`
- `ENABLE_TEST_AUTH_HELPER=false` outside explicit test runs
- `ENABLE_E2E_SESSION_BOOTSTRAP=false` in staging/production

## 2. Staging Deployment Process
1. Build artifact and run full test gates.
2. Deploy application to staging.
3. Run migrations on staging DB.
4. Run smoke tests and Playwright E2E.
5. Validate operational dashboards and alerts.

## 3. Production Deployment Process
1. Change approval and release window confirmation.
2. Confirm backups/PITR healthy and recent.
3. Run `npx prisma migrate deploy` against production.
4. Deploy application artifact.
5. Run post-deploy smoke checks and health endpoints.
6. Monitor errors/latency/queue metrics for stabilization window.

## 4. Migration Process
1. Generate migration in development.
2. Validate migration against staging snapshot.
3. Verify backward compatibility assumptions.
4. Deploy migration first, then app rollout.
5. Confirm schema health and critical indices.

### Neon URL Discipline
- `DATABASE_URL`: pooled connection for runtime API/serverless traffic.
- `DIRECT_DATABASE_URL`: direct connection for migrations and schema operations.
- Always run `prisma migrate deploy` using environment config where `DIRECT_DATABASE_URL` is present.
- Never run interactive/dev migrations against production.

## 5. Rollback Process
1. If app-only issue: rollback application release immediately.
2. If migration issue:
   - halt traffic-changing operations
   - execute approved DB rollback strategy (or forward-fix)
   - verify data integrity invariants (ledger/audit/match states)
3. Keep safe mode enabled during unstable recovery periods.

### DB Restore Notes
- Prefer forward-fix migrations when possible.
- If restore is required, execute Neon PITR restore to a new branch/database first, validate invariants, then cut over.
- After restore/cutover: rerun schema checks, runtime checks, and ledger/audit invariant checks.

## 6. Required Environment Variables
- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `NODE_ENV`
- `APP_ENV`
- `NEXT_PUBLIC_APP_ENV`
- `SESSION_SECRET`
- `ENABLE_TEST_AUTH_HELPER` (must be false in production)
- `ENABLE_E2E_SESSION_BOOTSTRAP` (must be false in production)
- `HEALTHCHECK_URL`
- logging sink configuration variables
- error monitoring DSN/token
- secrets manager access credentials/references

## 7. Post-Deploy Validation Checklist
- Auth/session flows healthy.
- Member contribution/request actions healthy.
- Matching batches run and idempotency intact.
- Dispute open/resolve flows healthy.
- Audit logs generated for admin actions.
- Safe mode toggle behaves correctly.

## 8. Go/No-Go Criteria
Go only when:
- all tests are green,
- `npm run build` is green,
- `npm run migrate:status` has no drift/pending surprises for target environment,
- legal/compliance sign-off is complete,
- backup/PITR restore drill has passed,
- on-call + runbook ownership confirmed,
- production readiness blockers are closed.
