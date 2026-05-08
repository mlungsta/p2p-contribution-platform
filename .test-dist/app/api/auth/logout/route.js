"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const auth_provider_1 = require("@/lib/auth-provider");
const api_route_1 = require("@/lib/api-route");
const session_auth_1 = require("@/lib/session-auth");
const db_1 = require("@/lib/db");
const auth_session_service_1 = require("@/server/services/auth-session-service");
async function POST(req) {
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
