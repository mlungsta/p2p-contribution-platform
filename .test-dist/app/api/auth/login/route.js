"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const zod_1 = require("zod");
const db_1 = require("@/lib/db");
const auth_provider_1 = require("@/lib/auth-provider");
const api_route_1 = require("@/lib/api-route");
const session_auth_1 = require("@/lib/session-auth");
const auth_session_service_1 = require("@/server/services/auth-session-service");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8)
});
async function POST(req) {
    const correlationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "auth", correlationId);
    if (limited)
        return limited;
    const payload = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(payload);
    if (!parsed.success) {
        return server_1.NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid login payload", correlationId } }, { status: 400 });
    }
    const service = new auth_session_service_1.AuthSessionService(db_1.db);
    try {
        const login = await service.loginWithCredentials(parsed.data.email, parsed.data.password);
        const res = server_1.NextResponse.json({ ok: true, correlationId });
        (0, auth_provider_1.setSessionCookie)(res, login.token);
        return res;
    }
    catch (error) {
        const res = server_1.NextResponse.json({
            ok: false,
            error: {
                code: error instanceof auth_session_service_1.AuthServiceError ? error.code : "UNAUTHORIZED",
                message: error instanceof auth_session_service_1.AuthServiceError ? error.message : "Invalid credentials",
                correlationId
            }
        }, { status: error instanceof auth_session_service_1.AuthServiceError && error.code === "FORBIDDEN" ? 403 : 401 });
        (0, auth_provider_1.clearSessionCookie)(res);
        return res;
    }
}
