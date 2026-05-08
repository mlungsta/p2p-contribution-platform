# Admin Runbook

Status: Operational runbook for admin and support workflows.

## 1. Safe Mode Operations
### When to enable
- Elevated failure rates in matching or dispute flows.
- DB lock contention/deadlocks beyond threshold.
- Suspected abuse/fraud event requiring containment.

### Effects
- New offers can be accepted but remain `WAITING_FOR_POOL`.
- Proof uploads remain available.
- Recipient confirmations remain available.
- Risky matching/rematching actions are restricted.

### Procedure
1. Confirm incident scope and impact.
2. SUPER_ADMIN enables safe mode.
3. Broadcast internal incident note with correlation IDs.
4. Monitor queue growth, disputes, and error metrics.
5. Disable safe mode only after remediation verification.

## 2. Dispute Handling
1. Verify dispute state is resolvable (`OPEN`, `EVIDENCE_REQUIRED`, `UNDER_REVIEW`).
2. Validate attached evidence and related proof metadata.
3. Record resolution note with clear rationale.
4. Resolve dispute via authorized role.
5. Confirm audit event exists with correlation ID.

## 3. Failed Payments Handling
1. Identify affected match IDs and user IDs.
2. Confirm payment proof presence and state transitions.
3. If dispute needed, open/route dispute.
4. Do not edit balances directly.
5. Use ledger reversal process only if correction is required.

## 4. Backlog Handling
1. Review pending offers/requests and dispute queues.
2. Prioritize unresolved disputes and blocked participants.
3. Run controlled batch matching windows after health checks.
4. Track backlog age and publish internal status updates.

## 5. Matching Pause/Resume
### Pause
1. Enable safe mode.
2. Stop non-essential rematching/override actions.
3. Verify no in-flight manual overrides without reason.

### Resume
1. Confirm DB/API health and lock contention normal.
2. Confirm dispute queue under control.
3. Run small validation batch.
4. Scale to normal batch cadence.

## 6. Audit Review
1. Filter by correlation ID and time window.
2. Verify required fields: actor, role, action, entity, reason (if applicable), batch run.
3. Escalate missing/invalid audit records immediately.

## 7. Access Boundaries
- SUPPORT: ticket/dispute support only, no financial record mutation.
- OPS_ADMIN: operational actions and dispute resolution.
- SUPER_ADMIN: override and system-level actions with required reason.
- COMPLIANCE_REVIEWER: read-only audit/report access.

## 8. Incident Escalation
1. Trigger incident channel and assign incident commander.
2. Capture timeline and impacted entities.
3. Preserve logs, correlation IDs, and query traces.
4. Complete post-incident review with remediation items.
