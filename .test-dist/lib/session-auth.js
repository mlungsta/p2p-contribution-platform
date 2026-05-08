"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthBoundaryError = void 0;
exports.resolveAuthenticatedSessionFromSources = resolveAuthenticatedSessionFromSources;
exports.resolveAuthenticatedSession = resolveAuthenticatedSession;
exports.getCorrelationId = getCorrelationId;
const node_crypto_1 = require("node:crypto");
const permissions_1 = require("./permissions");
const auth_provider_1 = require("./auth-provider");
const auth_session_service_1 = require("../server/services/auth-session-service");
class AuthBoundaryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.AuthBoundaryError = AuthBoundaryError;
function parseTestSessionFromHeaders(headers) {
    const enabled = process.env.NODE_ENV === "test" || process.env.ENABLE_TEST_AUTH_HELPER === "true";
    if (!enabled) {
        return null;
    }
    const actorUserId = headers.get("x-test-user-id");
    const actorRoleRaw = headers.get("x-test-user-role");
    if (!actorUserId || !actorRoleRaw) {
        return null;
    }
    const actorRole = permissions_1.appRoleSchema.parse(actorRoleRaw);
    return { actorUserId, actorRole };
}
async function parseBearerOrCookieSession(headers, cookies, prisma) {
    const rawToken = (0, auth_provider_1.getSessionTokenFromRequest)(headers, cookies);
    const service = new auth_session_service_1.AuthSessionService(prisma);
    return service.resolveIdentityFromToken(rawToken);
}
async function resolveAuthenticatedSessionFromSources(headers, cookies, prisma) {
    const testSession = parseTestSessionFromHeaders(headers);
    if (testSession) {
        return testSession;
    }
    const session = await parseBearerOrCookieSession(headers, cookies, prisma);
    if (session) {
        return session;
    }
    throw new AuthBoundaryError("UNAUTHORIZED", "Authentication required");
}
async function resolveAuthenticatedSession(req, prisma) {
    return resolveAuthenticatedSessionFromSources(req.headers, req.cookies, prisma);
}
function getCorrelationId(req) {
    return req.headers.get("x-correlation-id") ?? (0, node_crypto_1.randomUUID)();
}
