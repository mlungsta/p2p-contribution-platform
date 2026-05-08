"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
exports.clearRateLimitStore = clearRateLimitStore;
const env_1 = require("./env");
const logger_1 = require("./logger");
const DEFAULT_LIMITS = {
    public: { windowMs: 60_000, max: 120 },
    auth: { windowMs: 60_000, max: 20 },
    mutation: { windowMs: 60_000, max: 40 },
    admin: { windowMs: 60_000, max: 30 }
};
const store = new Map();
function nowMs() {
    return Date.now();
}
function getClientIp(req) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
        const first = forwarded.split(",")[0]?.trim();
        if (first)
            return first;
    }
    return req.headers.get("x-real-ip") ?? "unknown";
}
function keyFor(req, bucket) {
    return `${bucket}:${req.nextUrl.pathname}:${getClientIp(req)}`;
}
async function checkRateLimitInMemory(req, bucket, override) {
    const cfg = { ...DEFAULT_LIMITS[bucket], ...override };
    const key = keyFor(req, bucket);
    const now = nowMs();
    const current = store.get(key);
    if (!current || current.resetAt <= now) {
        const next = {
            count: 1,
            resetAt: now + cfg.windowMs
        };
        store.set(key, next);
        return {
            allowed: true,
            retryAfterSeconds: Math.ceil(cfg.windowMs / 1000),
            remaining: Math.max(0, cfg.max - 1),
            resetAt: next.resetAt
        };
    }
    current.count += 1;
    store.set(key, current);
    const remaining = Math.max(0, cfg.max - current.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return {
        allowed: current.count <= cfg.max,
        retryAfterSeconds,
        remaining,
        resetAt: current.resetAt
    };
}
async function checkRateLimitUpstash(req, bucket, override) {
    const env = (0, env_1.validateEnvironment)();
    const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!baseUrl || !token) {
        return null;
    }
    const cfg = { ...DEFAULT_LIMITS[bucket], ...override };
    const key = keyFor(req, bucket);
    const windowMs = cfg.windowMs;
    const now = nowMs();
    const response = await fetch(`${baseUrl}/pipeline`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify([
            ["INCR", key],
            ["PEXPIRE", key, String(windowMs), "NX"],
            ["PTTL", key]
        ])
    });
    if (!response.ok) {
        throw new Error(`Upstash rate limiter request failed with status ${response.status}`);
    }
    const payload = (await response.json());
    const results = payload?.result ?? [];
    const countRaw = results[0]?.result;
    const ttlRaw = results[2]?.result;
    const count = Number(countRaw ?? 0);
    const ttlMs = Number(ttlRaw ?? windowMs);
    const safeTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : windowMs;
    const resetAt = now + safeTtlMs;
    const remaining = Math.max(0, cfg.max - count);
    if (env.APP_ENV === "staging" || env.APP_ENV === "production") {
        logger_1.structuredLogger.info("rate_limit_provider_upstash", {
            correlationId: `rate-limit:${Date.now()}`,
            action: "rate_limit_provider",
            details: { bucket, provider: "upstash" }
        });
    }
    return {
        allowed: count <= cfg.max,
        retryAfterSeconds: Math.max(1, Math.ceil(safeTtlMs / 1000)),
        remaining,
        resetAt
    };
}
async function checkRateLimit(req, bucket, override) {
    try {
        const upstash = await checkRateLimitUpstash(req, bucket, override);
        if (upstash)
            return upstash;
    }
    catch (error) {
        logger_1.structuredLogger.warn("rate_limit_provider_fallback", {
            correlationId: `rate-limit-fallback:${Date.now()}`,
            action: "rate_limit_provider",
            details: { bucket, provider: "memory", error: error instanceof Error ? error.message : "unknown" }
        });
    }
    return checkRateLimitInMemory(req, bucket, override);
}
function clearRateLimitStore() {
    store.clear();
}
