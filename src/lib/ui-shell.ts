import { AppRole } from "./permissions";

const adminRoles: AppRole[] = ["OPS_ADMIN", "SUPER_ADMIN", "COMPLIANCE_REVIEWER"];

export function canAccessAdmin(role: AppRole): boolean {
  return adminRoles.includes(role);
}

export function canViewAuditLogs(role: AppRole): boolean {
  return role === "SUPER_ADMIN" || role === "COMPLIANCE_REVIEWER";
}

export function canModifyOperationalState(role: AppRole): boolean {
  return role === "OPS_ADMIN" || role === "SUPER_ADMIN";
}

export function canOverrideMatching(role: AppRole): boolean {
  return role === "SUPER_ADMIN";
}

export function statusTone(status: string): "positive" | "warning" | "danger" | "neutral" {
  if (["CONFIRMED", "COMPLETED", "RESOLVED", "APPROVED", "FULLY_MATCHED"].includes(status)) return "positive";
  if (["DISPUTED", "RESTRICTED", "SUSPENDED", "CANCELLED", "EXPIRED", "REJECTED"].includes(status)) return "danger";
  if (["WAITING_FOR_POOL", "AWAITING_PAYMENT", "AWAITING_CONFIRMATION", "PARTIALLY_MATCHED", "PENDING_REVIEW"].includes(status)) return "warning";
  return "neutral";
}

export function safeModeMessage(enabled: boolean): string {
  if (!enabled) return "Safe mode inactive. Standard batch operations are enabled.";
  return "Safe mode active: new offers wait in pool, confirmations continue, high-risk matching and overrides are restricted.";
}
