"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disputeStatuses = exports.matchStatuses = exports.contributionStatuses = exports.memberStatuses = void 0;
exports.memberStatuses = [
    "DRAFT",
    "PENDING_REVIEW",
    "APPROVED",
    "RESTRICTED",
    "SUSPENDED",
    "CLOSED"
];
exports.contributionStatuses = [
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
];
exports.matchStatuses = [
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
];
exports.disputeStatuses = [
    "OPEN",
    "EVIDENCE_REQUIRED",
    "UNDER_REVIEW",
    "RESOLVED",
    "REJECTED"
];
