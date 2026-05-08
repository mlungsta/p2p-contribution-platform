import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getSessionTokenFromRequest } from "@/lib/auth-provider";
import { enforceRateLimit } from "@/lib/api-route";
import { getCorrelationId } from "@/lib/session-auth";
import { db } from "@/lib/db";
import { AuthSessionService } from "@/server/services/auth-session-service";

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "auth", correlationId);
  if (limited) return limited;

  const rawToken = getSessionTokenFromRequest(req.headers, req.cookies);
  const authService = new AuthSessionService(db);
  await authService.revokeSessionByToken(rawToken, "user_logout");

  const res = NextResponse.json({ ok: true, correlationId });
  clearSessionCookie(res);
  return res;
}

