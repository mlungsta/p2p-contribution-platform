"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRouteContext = buildRouteContext;
exports.routeErrorResponse = routeErrorResponse;
exports.requireMemberRoute = requireMemberRoute;
exports.requireAdminRoute = requireAdminRoute;
exports.requireSuperAdminRoute = requireSuperAdminRoute;
exports.requireReadOnlyHistoryRoute = requireReadOnlyHistoryRoute;
const server_1 = require("next/server");
const session_auth_1 = require("./session-auth");
async function buildRouteContext(req, prisma, triggerSource) {
    const session = await (0, session_auth_1.resolveAuthenticatedSession)(req, prisma);
    return {
        actorUserId: session.actorUserId,
        actorRole: session.actorRole,
        correlationId: (0, session_auth_1.getCorrelationId)(req),
        triggerSource,
        batchRunId: req.headers.get("x-batch-run-id") ?? undefined
    };
}
function routeErrorResponse(error, correlationId) {
    if (error instanceof session_auth_1.AuthBoundaryError) {
        return server_1.NextResponse.json({
            ok: false,
            error: {
                code: error.code,
                message: error.message,
                correlationId
            }
        }, { status: error.code === "UNAUTHORIZED" ? 401 : 403 });
    }
    return server_1.NextResponse.json({
        ok: false,
        error: {
            code: "INTERNAL_ERROR",
            message: "Unexpected internal error",
            correlationId
        }
    }, { status: 500 });
}
function requireMemberRoute(role) {
    if (role !== "MEMBER") {
        throw new session_auth_1.AuthBoundaryError("FORBIDDEN", "Member access required");
    }
}
function requireAdminRoute(role) {
    if (!["OPS_ADMIN", "SUPER_ADMIN"].includes(role)) {
        throw new session_auth_1.AuthBoundaryError("FORBIDDEN", "Admin access required");
    }
}
function requireSuperAdminRoute(role) {
    if (role !== "SUPER_ADMIN") {
        throw new session_auth_1.AuthBoundaryError("FORBIDDEN", "Super admin access required");
    }
}
function requireReadOnlyHistoryRoute(role) {
    if (!["MEMBER", "COMPLIANCE_REVIEWER", "OPS_ADMIN", "SUPER_ADMIN"].includes(role)) {
        throw new session_auth_1.AuthBoundaryError("FORBIDDEN", "Read access required");
    }
}
