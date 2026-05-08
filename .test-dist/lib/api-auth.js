"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseApiContext = parseApiContext;
exports.requireMemberContext = requireMemberContext;
exports.requireAdminContext = requireAdminContext;
exports.requireSuperAdmin = requireSuperAdmin;
exports.requireReadOnlyComplianceOrMember = requireReadOnlyComplianceOrMember;
const zod_1 = require("zod");
const permissions_1 = require("./permissions");
const contextSchema = zod_1.z.object({
    actorUserId: zod_1.z.string().min(1),
    actorRole: permissions_1.appRoleSchema,
    correlationId: zod_1.z.string().min(1),
    triggerSource: zod_1.z.string().min(1),
    batchRunId: zod_1.z.string().optional()
});
function parseApiContext(req, fallbackTriggerSource) {
    const actorRoleRaw = req.headers.get("x-user-role");
    const actorRole = permissions_1.appRoleSchema.parse(actorRoleRaw);
    return contextSchema.parse({
        actorUserId: req.headers.get("x-user-id"),
        actorRole,
        correlationId: req.headers.get("x-correlation-id"),
        triggerSource: req.headers.get("x-trigger-source") ?? fallbackTriggerSource,
        batchRunId: req.headers.get("x-batch-run-id") ?? undefined
    });
}
function requireMemberContext(ctx) {
    if (ctx.actorRole !== "MEMBER") {
        throw new Error("FORBIDDEN_MEMBER_ROUTE");
    }
}
function requireAdminContext(ctx) {
    if (!["OPS_ADMIN", "SUPER_ADMIN"].includes(ctx.actorRole)) {
        throw new Error("FORBIDDEN_ADMIN_ROUTE");
    }
}
function requireSuperAdmin(ctx) {
    if (ctx.actorRole !== "SUPER_ADMIN") {
        throw new Error("FORBIDDEN_SUPER_ADMIN_REQUIRED");
    }
}
function requireReadOnlyComplianceOrMember(ctx) {
    if (!["MEMBER", "COMPLIANCE_REVIEWER", "OPS_ADMIN", "SUPER_ADMIN"].includes(ctx.actorRole)) {
        throw new Error("FORBIDDEN_HISTORY_ROUTE");
    }
}
