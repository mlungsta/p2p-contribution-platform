import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildRouteContext, requireMemberRoute, routeErrorResponse } from "@/lib/route-auth";
import { getCorrelationId } from "@/lib/session-auth";
import { RuntimeApiService, executeWithErrorHandling } from "@/server/services/runtime-api-service";
import { enforceRateLimit, mapApiResultStatus } from "@/lib/api-route";

export async function POST(req: NextRequest) {
  const fallbackCorrelationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "mutation", fallbackCorrelationId);
  if (limited) return limited;

  try {
    const payload = await req.json();
    const ctx = await buildRouteContext(req, db, "api:confirmations");
    requireMemberRoute(ctx.actorRole);

    const service = new RuntimeApiService(db);
    const result = await executeWithErrorHandling(ctx, () => service.confirmReceipt(ctx, payload));
    return NextResponse.json(result, { status: mapApiResultStatus(result) });
  } catch (error) {
    return routeErrorResponse(error, fallbackCorrelationId);
  }
}

