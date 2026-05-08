import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { buildRouteContext, requireSuperAdminRoute, routeErrorResponse } from "@/lib/route-auth";
import { getCorrelationId } from "@/lib/session-auth";
import { enforceRateLimit } from "@/lib/api-route";
import { requireStepUpForSensitiveAction } from "@/lib/step-up-policy";
import { AuthServiceError, AuthSessionService } from "@/server/services/auth-session-service";

const revokeSchema = z.object({
  targetUserId: z.string().min(1),
  reason: z.string().min(3)
});

export async function POST(req: NextRequest) {
  const fallbackCorrelationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "admin", fallbackCorrelationId);
  if (limited) return limited;

  try {
    const payloadInput = await req.json();
    const parsed = revokeSchema.safeParse(payloadInput);
    if (!parsed.success) {
      return NextResponse.json({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "targetUserId and reason are required", correlationId: fallbackCorrelationId }
      }, { status: 400 });
    }
    const payload = parsed.data;

    requireStepUpForSensitiveAction(req);

    const ctx = await buildRouteContext(req, db, "api:admin:sessions:revoke-user");
    requireSuperAdminRoute(ctx.actorRole);

    const service = new AuthSessionService(db);
    const revokedSessionCount = await service.revokeAllUserSessions({
      actorUserId: ctx.actorUserId,
      actorRole: ctx.actorRole,
      targetUserId: payload.targetUserId,
      reason: payload.reason,
      correlationId: ctx.correlationId,
      triggerSource: ctx.triggerSource
    });

    return NextResponse.json({ ok: true, correlationId: ctx.correlationId, data: { revokedSessionCount } });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return NextResponse.json({
        ok: false,
        error: { code: error.code, message: error.message, correlationId: fallbackCorrelationId }
      }, { status: error.code === "FORBIDDEN" ? 403 : 400 });
    }
    return routeErrorResponse(error, fallbackCorrelationId);
  }
}

