"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapApiResultStatus = mapApiResultStatus;
exports.enforceRateLimit = enforceRateLimit;
const server_1 = require("next/server");
const rate_limit_1 = require("./rate-limit");
const logger_1 = require("./logger");
function mapApiResultStatus(result) {
    if (result.ok)
        return 200;
    const code = result.error?.code;
    if (code === "FORBIDDEN")
        return 403;
    if (code === "UNAUTHORIZED")
        return 401;
    if (code === "NOT_FOUND")
        return 404;
    if (code === "INVALID_STATE" || code === "SAFE_MODE_BLOCKED" || code === "CONSTRAINT_VIOLATION")
        return 409;
    if (code === "INTERNAL_ERROR")
        return 500;
    return 400;
}
async function enforceRateLimit(req, bucket, correlationId) {
    const result = await (0, rate_limit_1.checkRateLimit)(req, bucket);
    if (result.allowed)
        return null;
    logger_1.structuredLogger.warn("rate_limit_blocked", {
        correlationId,
        action: `rate_limit:${bucket}`,
        details: {
            path: req.nextUrl.pathname,
            retry_after_seconds: result.retryAfterSeconds
        }
    });
    return server_1.NextResponse.json({
        ok: false,
        error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please retry later.",
            correlationId
        }
    }, {
        status: 429,
        headers: {
            "Retry-After": String(result.retryAfterSeconds),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(result.resetAt)
        }
    });
}
