import { NextRequest } from "next/server";
import { validateEnvironment } from "./env";
import { structuredLogger } from "./logger";

export type RateLimitBucket = "public" | "auth" | "mutation" | "admin";

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  resetAt: number;
}

const DEFAULT_LIMITS: Record<RateLimitBucket, RateLimitConfig> = {
  public: { windowMs: 60_000, max: 120 },
  auth: { windowMs: 60_000, max: 20 },
  mutation: { windowMs: 60_000, max: 40 },
  admin: { windowMs: 60_000, max: 30 }
};

interface BucketState {
  count: number;
  resetAt: number;
}

const store = new Map<string, BucketState>();

function nowMs(): number {
  return Date.now();
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

function keyFor(req: NextRequest, bucket: RateLimitBucket): string {
  return `${bucket}:${req.nextUrl.pathname}:${getClientIp(req)}`;
}

async function checkRateLimitInMemory(req: NextRequest, bucket: RateLimitBucket, override?: Partial<RateLimitConfig>): Promise<RateLimitResult> {
  const cfg = { ...DEFAULT_LIMITS[bucket], ...override };
  const key = keyFor(req, bucket);
  const now = nowMs();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    const next: BucketState = {
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

async function checkRateLimitUpstash(req: NextRequest, bucket: RateLimitBucket, override?: Partial<RateLimitConfig>): Promise<RateLimitResult | null> {
  const env = validateEnvironment();
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

  const payload = (await response.json()) as { result?: Array<{ result?: unknown }> };
  const results = payload?.result ?? [];
  const countRaw = results[0]?.result;
  const ttlRaw = results[2]?.result;
  const count = Number(countRaw ?? 0);
  const ttlMs = Number(ttlRaw ?? windowMs);
  const safeTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : windowMs;
  const resetAt = now + safeTtlMs;
  const remaining = Math.max(0, cfg.max - count);

  if (env.APP_ENV === "staging" || env.APP_ENV === "production") {
    structuredLogger.info("rate_limit_provider_upstash", {
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

export async function checkRateLimit(req: NextRequest, bucket: RateLimitBucket, override?: Partial<RateLimitConfig>): Promise<RateLimitResult> {
  try {
    const upstash = await checkRateLimitUpstash(req, bucket, override);
    if (upstash) return upstash;
  } catch (error) {
    structuredLogger.warn("rate_limit_provider_fallback", {
      correlationId: `rate-limit-fallback:${Date.now()}`,
      action: "rate_limit_provider",
      details: { bucket, provider: "memory", error: error instanceof Error ? error.message : "unknown" }
    });
  }
  return checkRateLimitInMemory(req, bucket, override);
}

export function clearRateLimitStore(): void {
  store.clear();
}
