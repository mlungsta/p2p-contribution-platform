import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildRouteContext, routeErrorResponse } from "@/lib/route-auth";
import { getCorrelationId } from "@/lib/session-auth";
import { RuntimeApiService, executeWithErrorHandling } from "@/server/services/runtime-api-service";
import { enforceRateLimit, mapApiResultStatus } from "@/lib/api-route";
import { requireStepUpForSensitiveAction } from "@/lib/step-up-policy";

export async function GET(req: NextRequest) {
  const fallbackCorrelationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "admin", fallbackCorrelationId);
  if (limited) return limited;

  try {
    const ctx = await buildRouteContext(req, db, "api:admin:safe-mode:get");
    const service = new RuntimeApiService(db);
    const result = await executeWithErrorHandling(ctx, () => service.getSafeMode(ctx));
    return NextResponse.json(result, { status: mapApiResultStatus(result) });
  } catch (error) {
    return routeErrorResponse(error, fallbackCorrelationId);
  }
}

export async function PATCH(req: NextRequest) {
  const fallbackCorrelationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "admin", fallbackCorrelationId);
  if (limited) return limited;

  try {
    const payload = await req.json();
    requireStepUpForSensitiveAction(req);
    const ctx = await buildRouteContext(req, db, "api:admin:safe-mode:set");
    const service = new RuntimeApiService(db);
    const result = await executeWithErrorHandling(ctx, () => service.setSafeMode(ctx, payload));
    return NextResponse.json(result, { status: mapApiResultStatus(result) });
  } catch (error) {
    return routeErrorResponse(error, fallbackCorrelationId);
  }
}

