# Go / No-Go Template

Decision Date: ____
Environment: Staging / Production
Release Tag/Commit: ____
Incident Commander: ____
Approvers: Product ____ | Engineering ____ | Security ____ | Compliance ____

## 1. Gate Summary
- Lint: PASS / FAIL
- Typecheck: PASS / FAIL
- Build: PASS / FAIL
- Unit/Auth/Runtime/UI-Runtime: PASS / FAIL
- E2E: PASS / FAIL
- Stress: PASS / FAIL
- Security: PASS / FAIL
- Schema + Migration Status: PASS / FAIL
- Postdeploy Health: PASS / FAIL

## 2. Blocking Conditions (Must be NO)
- Compliance/legal approval missing: YES / NO
- Alert routing missing: YES / NO
- Backup/PITR confirmation missing: YES / NO
- Migration dry run failed: YES / NO
- Health check failed: YES / NO
- E2E/stress/security failed: YES / NO

## 3. Risk Register
- Top Risk #1: ____ | Mitigation: ____ | Owner: ____
- Top Risk #2: ____ | Mitigation: ____ | Owner: ____
- Top Risk #3: ____ | Mitigation: ____ | Owner: ____

## 4. Rollback Readiness
- Rollback command/process reviewed: YES / NO
- Data restore path validated: YES / NO
- Safe mode fallback verified: YES / NO

## 5. Decision
- Final Decision: GO / NO-GO
- If NO-GO, blockers to clear:
  1. ____
  2. ____
  3. ____

## 6. Sign-Off
- Engineering Lead: ____ (Date/Time)
- Security Lead: ____ (Date/Time)
- Compliance/Legal: ____ (Date/Time)
- Operations Lead: ____ (Date/Time)
