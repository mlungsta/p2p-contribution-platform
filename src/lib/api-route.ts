import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RateLimitBucket } from "./rate-limit";
import { structuredLogger } from "./logger";

export function mapApiResultStatus(result: { ok: boolean; error?: { code?: string } }): number {
  if (result.ok) return 200;
  const code = result.error?.code;
  if (code === "FORBIDDEN") return 403;
  if (code === "UNAUTHORIZED") return 401;
  if (code === "NOT_FOUND") return 404;
  if (code === "INVALID_STATE" || code === "SAFE_MODE_BLOCKED" || code === "CONSTRAINT_VIOLATION") return 409;
  if (code === "INTERNAL_ERROR") return 500;
  return 400;
}

export async function enforceRateLimit(req: NextRequest, bucket: RateLimitBucket, correlationId: string): Promise<NextResponse | null> {
  const result = await checkRateLimit(req, bucket);
  if (result.allowed) return null;

  structuredLogger.warn("rate_limit_blocked", {
    correlationId,
    action: `rate_limit:${bucket}`,
    details: {
      path: req.nextUrl.pathname,
      retry_after_seconds: result.retryAfterSeconds
    }
  });

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please retry later.",
        correlationId
      }
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetAt)
      }
    }
  );
}
