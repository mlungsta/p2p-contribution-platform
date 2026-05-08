import { z } from "zod";

export const roles = [
  "MEMBER",
  "SUPPORT",
  "OPS_ADMIN",
  "SUPER_ADMIN",
  "COMPLIANCE_REVIEWER"
] as const;

export const appRoleSchema = z.enum(roles);

export type AppRole = z.infer<typeof appRoleSchema>;

export const permissions = [
  "contribution:create",
  "contribution:view:own",
  "match:view:own",
  "proof:upload",
  "receipt:confirm",
  "dispute:create",
  "ticket:view",
  "ticket:respond",
  "match:review",
  "proof:review",
  "dispute:review",
  "rules:configure",
  "system:pause",
  "matching:override",
  "audit:view",
  "reports:view"
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissionMap: Record<AppRole, readonly Permission[]> = {
  MEMBER: [
    "contribution:create",
    "contribution:view:own",
    "match:view:own",
    "proof:upload",
    "receipt:confirm",
    "dispute:create"
  ],
  SUPPORT: ["ticket:view", "ticket:respond"],
  OPS_ADMIN: ["match:review", "proof:review", "dispute:review"],
  SUPER_ADMIN: [
    "match:review",
    "proof:review",
    "dispute:review",
    "rules:configure",
    "system:pause",
    "matching:override",
    "audit:view",
    "reports:view"
  ],
  COMPLIANCE_REVIEWER: ["audit:view", "reports:view"]
};

export function getRolePermissions(role: AppRole): readonly Permission[] {
  return rolePermissionMap[role];
}

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return rolePermissionMap[role].includes(permission);
}

export function requirePermission(role: AppRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: role ${role} missing permission ${permission}`);
  }
}

export function isAdminRole(role: AppRole): boolean {
  return role === "OPS_ADMIN" || role === "SUPER_ADMIN" || role === "COMPLIANCE_REVIEWER";
}
