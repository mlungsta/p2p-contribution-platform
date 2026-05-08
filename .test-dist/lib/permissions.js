"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissions = exports.appRoleSchema = exports.roles = void 0;
exports.getRolePermissions = getRolePermissions;
exports.hasPermission = hasPermission;
exports.requirePermission = requirePermission;
exports.isAdminRole = isAdminRole;
const zod_1 = require("zod");
exports.roles = [
    "MEMBER",
    "SUPPORT",
    "OPS_ADMIN",
    "SUPER_ADMIN",
    "COMPLIANCE_REVIEWER"
];
exports.appRoleSchema = zod_1.z.enum(exports.roles);
exports.permissions = [
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
];
const rolePermissionMap = {
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
function getRolePermissions(role) {
    return rolePermissionMap[role];
}
function hasPermission(role, permission) {
    return rolePermissionMap[role].includes(permission);
}
function requirePermission(role, permission) {
    if (!hasPermission(role, permission)) {
        throw new Error(`Forbidden: role ${role} missing permission ${permission}`);
    }
}
function isAdminRole(role) {
    return role === "OPS_ADMIN" || role === "SUPER_ADMIN" || role === "COMPLIANCE_REVIEWER";
}
