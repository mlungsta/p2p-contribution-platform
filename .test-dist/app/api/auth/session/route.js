"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
exports.POST = POST;
exports.DELETE = DELETE;
const server_1 = require("next/server");
const db_1 = require("@/lib/db");
const session_auth_1 = require("@/lib/session-auth");
const logger_1 = require("@/lib/logger");
const api_route_1 = require("@/lib/api-route");
const session_bootstrap_policy_1 = require("@/lib/session-bootstrap-policy");
const auth_provider_1 = require("@/lib/auth-provider");
const auth_session_service_1 = require("@/server/services/auth-session-service");
function parseRole(input) {
    if (input === "MEMBER" || input === "SUPPORT" || input === "OPS_ADMIN" || input === "SUPER_ADMIN" || input === "COMPLIANCE_REVIEWER") {
        return input;
    }
    return "MEMBER";
}
async function GET(req) {
    const correlationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "auth", correlationId);
    if (limited)
        return limited;
    try {
        const session = await (0, session_auth_1.resolveAuthenticatedSession)(req, db_1.db);
        return server_1.NextResponse.json({ ok: true, correlationId, data: { actorUserId: session.actorUserId, actorRole: session.actorRole } });
    }
    catch {
        return server_1.NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required", correlationId } }, { status: 401 });
    }
}
async function POST(req) {
    const correlationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "auth", correlationId);
    if (limited)
        return limited;
    if (process.env.NODE_ENV === "production") {
        logger_1.structuredLogger.warn("session_bootstrap_denied", {
            correlationId,
            action: "auth.session.bootstrap",
            details: { reason: "production" }
        });
        return server_1.NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Direct session bootstrap disabled in production", correlationId } }, { status: 403 });
    }
    if (!(0, session_bootstrap_policy_1.isSessionBootstrapAllowed)(process.env)) {
        return server_1.NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Direct session bootstrap allowed only in test/e2e", correlationId } }, { status: 403 });
    }
    const payload = await req.json().catch(() => ({}));
    const userId = typeof payload?.userId === "string" ? payload.userId : "";
    const email = typeof payload?.email === "string" ? payload.email : "";
    const role = parseRole(payload?.role);
    if (!userId && !email) {
        return server_1.NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "userId or email is required", correlationId } }, { status: 400 });
    }
    let user = userId
        ? await db_1.db.user.findUnique({ where: { id: userId }, select: { id: true } })
        : null;
    if (!user && email) {
        const upserted = await db_1.db.user.upsert({
            where: { email },
            create: {
                email,
                passwordHash: "",
                role,
                memberStatus: "APPROVED"
            },
            update: {
                role,
                memberStatus: "APPROVED"
            },
            select: { id: true }
        });
        user = upserted;
    }
    if (!user) {
        return server_1.NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "User not found", correlationId } }, { status: 404 });
    }
    const session = (0, auth_provider_1.createSessionToken)(user.id);
    await db_1.db.authSession.create({
        data: {
            userId: user.id,
            jti: session.payload.jti,
            expiresAt: new Date(session.payload.exp * 1000)
        }
    });
    const res = server_1.NextResponse.json({ ok: true, correlationId });
    (0, auth_provider_1.setSessionCookie)(res, session.token);
    return res;
}
async function DELETE(req) {
    const correlationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "auth", correlationId);
    if (limited)
        return limited;
    const rawToken = (0, auth_provider_1.getSessionTokenFromRequest)(req.headers, req.cookies);
    const authService = new auth_session_service_1.AuthSessionService(db_1.db);
    await authService.revokeSessionByToken(rawToken, "user_logout");
    const res = server_1.NextResponse.json({ ok: true, correlationId });
    (0, auth_provider_1.clearSessionCookie)(res);
    return res;
}
