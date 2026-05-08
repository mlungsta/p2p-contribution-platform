"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const zod_1 = require("zod");
const db_1 = require("@/lib/db");
const route_auth_1 = require("@/lib/route-auth");
const session_auth_1 = require("@/lib/session-auth");
const api_route_1 = require("@/lib/api-route");
const step_up_policy_1 = require("@/lib/step-up-policy");
const auth_session_service_1 = require("@/server/services/auth-session-service");
const revokeSchema = zod_1.z.object({
    targetUserId: zod_1.z.string().min(1),
    reason: zod_1.z.string().min(3)
});
async function POST(req) {
    const fallbackCorrelationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "admin", fallbackCorrelationId);
    if (limited)
        return limited;
    try {
        const payloadInput = await req.json();
        const parsed = revokeSchema.safeParse(payloadInput);
        if (!parsed.success) {
            return server_1.NextResponse.json({
                ok: false,
                error: { code: "VALIDATION_ERROR", message: "targetUserId and reason are required", correlationId: fallbackCorrelationId }
            }, { status: 400 });
        }
        const payload = parsed.data;
        (0, step_up_policy_1.requireStepUpForSensitiveAction)(req);
        const ctx = await (0, route_auth_1.buildRouteContext)(req, db_1.db, "api:admin:sessions:revoke-user");
        (0, route_auth_1.requireSuperAdminRoute)(ctx.actorRole);
        const service = new auth_session_service_1.AuthSessionService(db_1.db);
        const revokedSessionCount = await service.revokeAllUserSessions({
            actorUserId: ctx.actorUserId,
            actorRole: ctx.actorRole,
            targetUserId: payload.targetUserId,
            reason: payload.reason,
            correlationId: ctx.correlationId,
            triggerSource: ctx.triggerSource
        });
        return server_1.NextResponse.json({ ok: true, correlationId: ctx.correlationId, data: { revokedSessionCount } });
    }
    catch (error) {
        if (error instanceof auth_session_service_1.AuthServiceError) {
            return server_1.NextResponse.json({
                ok: false,
                error: { code: error.code, message: error.message, correlationId: fallbackCorrelationId }
            }, { status: error.code === "FORBIDDEN" ? 403 : 400 });
        }
        return (0, route_auth_1.routeErrorResponse)(error, fallbackCorrelationId);
    }
}
