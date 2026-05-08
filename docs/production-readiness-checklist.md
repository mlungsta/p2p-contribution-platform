# Production Readiness Checklist

Status: Review-only hardening checklist for launch readiness.

## 1. Critical Blockers (Must Resolve Before Go-Live)
- Real auth provider replacement for local test bootstrap.
- API rate limiting for auth/session bootstrap, matching, disputes, proof upload, and admin actions.
- Centralized structured logging pipeline with retention/search.
- Error monitoring and alerting (runtime, DB, queue/job failures).
- Database backup and PITR policy with tested restore runbook.
- Environment separation (dev, staging, prod) with strict config isolation.
- Secrets management with rotation and access control.
- Legal/compliance sign-off for jurisdiction, disclosures, and terms.
- Privacy policy and data retention/deletion policy.
- Support operations coverage and escalation ownership.
- Admin runbook with incident procedures and role boundaries.

## 2. Security Readiness
- Disable non-production session bootstrap in production (already required).
- Enforce strong auth/session provider with signed tokens and rotation.
- Add WAF/rate limits for public and sensitive endpoints.
- Validate CORS and cookie/session security settings.
- Verify RBAC checks on all admin and financial paths.
- Run dependency and container image vulnerability scans.

## 3. Operational Readiness
- Define SLOs: API availability, matching latency, dispute resolution SLA.
- Define run-time dashboards: error rate, p95 latency, DB CPU/locks, queue depth.
- Add alert thresholds for idempotency collisions and lock contention.
- Document on-call rotations and incident escalation matrix.
- Validate safe mode behavior through drills.

## 4. Data Readiness
- Confirm migration strategy and rollback constraints.
- Confirm immutable ledger and audit invariants in production data.
- Verify disaster recovery RTO/RPO targets.
- Verify encryption at rest and in transit.

## 5. Compliance Readiness
- Ensure disclaimers are explicit: no guaranteed ROI, no custody wallet.
- Confirm audit log access controls and retention schedule.
- Confirm dispute evidence handling policy and PII controls.
- Confirm report/export access governance.

## 6. Release Readiness Gates
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run test:auth`
- `npm run test:schema`
- `npm run test:runtime`
- `npm run test:ui-runtime`
- `npm run test:e2e`
- `npm run test:stress`
- `npm run test:security`
- `npm run test:deploy-config`
- `npm run ops:alerts`
- `npm run migrate:status`
- `npm run predeploy:enum`

Go-live is blocked until all critical blockers are closed and gates are green.
