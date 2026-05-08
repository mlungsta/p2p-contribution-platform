"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionToken = createSessionToken;
exports.verifySessionToken = verifySessionToken;
exports.setSessionCookie = setSessionCookie;
exports.clearSessionCookie = clearSessionCookie;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.getSessionTokenFromRequest = getSessionTokenFromRequest;
const node_crypto_1 = require("node:crypto");
const env_1 = require("./env");
const SESSION_COOKIE_NAME = "session_token";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const PASSWORD_PREFIX = "s2";
function getSessionSecret() {
    const env = (0, env_1.validateEnvironment)();
    if (env.SESSION_SECRET && env.SESSION_SECRET.trim().length >= 16) {
        return env.SESSION_SECRET;
    }
    if (env.NODE_ENV === "production") {
        throw new Error("SESSION_SECRET is required in production");
    }
    return "dev-only-session-secret-change-me";
}
function base64UrlEncode(value) {
    return Buffer.from(value, "utf8").toString("base64url");
}
function base64UrlDecode(value) {
    return Buffer.from(value, "base64url").toString("utf8");
}
function signPayload(payload) {
    const sig = (0, node_crypto_1.createHmac)("sha256", getSessionSecret()).update(payload).digest("base64url");
    return sig;
}
function createSessionToken(userId, now = new Date()) {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + SESSION_TTL_SECONDS;
    const body = { sub: userId, iat, exp, jti: (0, node_crypto_1.randomBytes)(16).toString("hex") };
    const payload = base64UrlEncode(JSON.stringify(body));
    const signature = signPayload(payload);
    return {
        token: `v1.${payload}.${signature}`,
        payload: body
    };
}
function verifySessionToken(token, now = new Date()) {
    if (!token)
        return null;
    const [version, payload, signature] = token.split(".");
    if (version !== "v1" || !payload || !signature)
        return null;
    const expected = signPayload(payload);
    const actualBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (actualBuf.length !== expectedBuf.length || !(0, node_crypto_1.timingSafeEqual)(actualBuf, expectedBuf)) {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(base64UrlDecode(payload));
    }
    catch {
        return null;
    }
    if (!parsed?.sub || typeof parsed.sub !== "string")
        return null;
    if (!parsed?.jti || typeof parsed.jti !== "string")
        return null;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (typeof parsed.exp !== "number" || parsed.exp <= nowSeconds)
        return null;
    return parsed;
}
function setSessionCookie(res, token) {
    res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_SECONDS
    });
}
function clearSessionCookie(res) {
    res.cookies.set(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0
    });
}
function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString("hex");
    const derived = (0, node_crypto_1.scryptSync)(password, salt, 64).toString("hex");
    return `${PASSWORD_PREFIX}:${salt}:${derived}`;
}
function verifyPassword(password, storedHash) {
    const parts = storedHash.split(":");
    if (parts.length !== 3 || parts[0] !== PASSWORD_PREFIX) {
        return false;
    }
    const [, salt, expectedHex] = parts;
    const derivedHex = (0, node_crypto_1.scryptSync)(password, salt, 64).toString("hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");
    const derivedBuf = Buffer.from(derivedHex, "hex");
    if (expectedBuf.length !== derivedBuf.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(expectedBuf, derivedBuf);
}
function getSessionTokenFromRequest(headers, cookies) {
    const authHeader = headers.get("authorization");
    const bearerToken = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
    const cookieToken = cookies?.get(SESSION_COOKIE_NAME)?.value ?? null;
    return bearerToken ?? cookieToken;
}
