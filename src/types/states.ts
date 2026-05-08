export const memberStatuses = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "RESTRICTED",
  "SUSPENDED",
  "CLOSED"
] as const;

export const contributionStatuses = [
  "CREATED",
  "WAITING_FOR_POOL",
  "ACTIVE",
  "MATCHED",
  "AWAITING_PAYMENT",
  "PROOF_UPLOADED",
  "CONFIRMED",
  "DISPUTED",
  "RESOLVED",
  "EXPIRED",
  "CANCELLED"
] as const;

export const matchStatuses = [
  "CREATED",
  "ASSIGNED",
  "AWAITING_PAYMENT",
  "PROOF_UPLOADED",
  "AWAITING_RECIPIENT_CONFIRMATION",
  "CONFIRMED",
  "DISPUTED",
  "EXPIRED",
  "CANCELLED",
  "ADMIN_RESOLVED"
] as const;

export const disputeStatuses = [
  "OPEN",
  "EVIDENCE_REQUIRED",
  "UNDER_REVIEW",
  "RESOLVED",
  "REJECTED"
] as const;
