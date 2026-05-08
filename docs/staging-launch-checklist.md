# Staging Launch Checklist

Status: Execution checklist for staging launch readiness.

## 1. Preconditions
- [ ] `APP_ENV=staging` and `NODE_ENV=production` in staging runtime.
- [ ] Staging secrets are configured and verified via `npm run verify:staging-env`.
- [ ] `ENABLE_E2E_SESSION_BOOTSTRAP=false` and `ENABLE_TEST_AUTH_HELPER=false`.
- [ ] Session/auth controls validated (login/logout/revocation).

## 2. Database + Migration
- [ ] Confirm Neon pooled URL is configured as `DATABASE_URL`.
- [ ] Confirm Neon direct URL is configured as `DIRECT_DATABASE_URL`.
- [ ] Run migration dry run plan review (SQL + rollback notes).
- [ ] Run `npm run migrate:status` with staging env.
- [ ] Run `npm run deploy:staging:migrate`.
- [ ] Re-run `npm run test:schema` against staging DB.

## 3. Runtime Safety Controls
- [ ] Upstash Redis limiter configured and reachable.
- [ ] Structured log provider endpoint reachable.
- [ ] Error monitoring provider endpoint reachable.
- [ ] Alert routing verified for severity levels.
- [ ] Safe mode toggle and read path verified.

## 4. Quality Gates (Must Pass)
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run test:auth`
- [ ] `npm run test:schema`
- [ ] `npm run test:runtime`
- [ ] `npm run test:ui-runtime`
- [ ] `npm run test:e2e`
- [ ] `npm run test:stress`
- [ ] `npm run test:security`
- [ ] `npm run ops:alerts`

## 5. Operational Checks
- [ ] Postdeploy health check passed (`npm run postdeploy:health`).
- [ ] Backup/PITR confirmation documented for staging baseline.
- [ ] Admin runbook drill completed (safe mode, dispute resolution, audit verification).
- [ ] Correlation ID traceability verified end-to-end.

## 6. Compliance + Governance
- [ ] Legal/compliance approval documented.
- [ ] Privacy/retention review confirmed for staging data handling.
- [ ] Security sign-off captured (auth/session/rate-limit controls).

## 7. Explicit NO-GO Conditions
- Missing compliance/legal approval.
- Missing alert routing for logs/errors.
- Missing backup/PITR confirmation.
- Failed migration dry run.
- Failed postdeploy health check.
- Failed E2E/stress/security gates.
- Any unresolved high/critical blocker in go/no-go review.

## 8. Exit Criteria
- [ ] Go/No-Go template completed and signed by required owners.
- [ ] All checklist items complete with evidence links.
- [ ] Staging marked ready for production cutover planning.
