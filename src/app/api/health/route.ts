import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/api-route";
import { getCorrelationId } from "@/lib/session-auth";

export async function GET(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "public", correlationId);
  if (limited) return limited;

  return NextResponse.json({ status: "ok", correlationId });
}

