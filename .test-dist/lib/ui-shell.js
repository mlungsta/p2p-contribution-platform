"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAccessAdmin = canAccessAdmin;
exports.canViewAuditLogs = canViewAuditLogs;
exports.canModifyOperationalState = canModifyOperationalState;
exports.canOverrideMatching = canOverrideMatching;
exports.statusTone = statusTone;
exports.safeModeMessage = safeModeMessage;
const adminRoles = ["OPS_ADMIN", "SUPER_ADMIN", "COMPLIANCE_REVIEWER"];
function canAccessAdmin(role) {
    return adminRoles.includes(role);
}
function canViewAuditLogs(role) {
    return role === "SUPER_ADMIN" || role === "COMPLIANCE_REVIEWER";
}
function canModifyOperationalState(role) {
    return role === "OPS_ADMIN" || role === "SUPER_ADMIN";
}
function canOverrideMatching(role) {
    return role === "SUPER_ADMIN";
}
function statusTone(status) {
    if (["CONFIRMED", "COMPLETED", "RESOLVED", "APPROVED", "FULLY_MATCHED"].includes(status))
        return "positive";
    if (["DISPUTED", "RESTRICTED", "SUSPENDED", "CANCELLED", "EXPIRED", "REJECTED"].includes(status))
        return "danger";
    if (["WAITING_FOR_POOL", "AWAITING_PAYMENT", "AWAITING_CONFIRMATION", "PARTIALLY_MATCHED", "PENDING_REVIEW"].includes(status))
        return "warning";
    return "neutral";
}
function safeModeMessage(enabled) {
    if (!enabled)
        return "Safe mode inactive. Standard batch operations are enabled.";
    return "Safe mode active: new offers wait in pool, confirmations continue, high-risk matching and overrides are restricted.";
}
