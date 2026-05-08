import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildRouteContext, requireAdminRoute, routeErrorResponse } from "@/lib/route-auth";
import { getCorrelationId } from "@/lib/session-auth";
import { RuntimeApiService, executeWithErrorHandling } from "@/server/services/runtime-api-service";
import { enforceRateLimit, mapApiResultStatus } from "@/lib/api-route";

export async function GET(req: NextRequest) {
  const fallbackCorrelationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "admin", fallbackCorrelationId);
  if (limited) return limited;

  try {
    const ctx = await buildRouteContext(req, db, "api:admin:members:list");
    requireAdminRoute(ctx.actorRole);
    const service = new RuntimeApiService(db);
    const result = await executeWithErrorHandling(ctx, () => service.listMembers(ctx));
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
    const ctx = await buildRouteContext(req, db, "api:admin:members:update-status");
    requireAdminRoute(ctx.actorRole);
    const service = new RuntimeApiService(db);
    const result = await executeWithErrorHandling(ctx, () => service.updateMemberStatus(ctx, payload));
    return NextResponse.json(result, { status: mapApiResultStatus(result) });
  } catch (error) {
    return routeErrorResponse(error, fallbackCorrelationId);
  }
}
