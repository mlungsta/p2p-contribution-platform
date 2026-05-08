import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCorrelationId, resolveAuthenticatedSession } from "@/lib/session-auth";
import { structuredLogger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/api-route";
import { isSessionBootstrapAllowed } from "@/lib/session-bootstrap-policy";
import { clearSessionCookie, createSessionToken, getSessionTokenFromRequest, setSessionCookie } from "@/lib/auth-provider";
import { UserRole } from "@prisma/client";
import { AuthSessionService } from "@/server/services/auth-session-service";

function parseRole(input: unknown): UserRole {
  if (input === "MEMBER" || input === "SUPPORT" || input === "OPS_ADMIN" || input === "SUPER_ADMIN" || input === "COMPLIANCE_REVIEWER") {
    return input;
  }
  return "MEMBER";
}

export async function GET(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "auth", correlationId);
  if (limited) return limited;

  try {
    const session = await resolveAuthenticatedSession(req, db);
    return NextResponse.json({ ok: true, correlationId, data: { actorUserId: session.actorUserId, actorRole: session.actorRole } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required", correlationId } }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "auth", correlationId);
  if (limited) return limited;

  if (process.env.NODE_ENV === "production") {
    structuredLogger.warn("session_bootstrap_denied", {
      correlationId,
      action: "auth.session.bootstrap",
      details: { reason: "production" }
    });
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Direct session bootstrap disabled in production", correlationId } }, { status: 403 });
  }

  if (!isSessionBootstrapAllowed(process.env)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Direct session bootstrap allowed only in test/e2e", correlationId } }, { status: 403 });
  }

  const payload = await req.json().catch(() => ({}));
  const userId = typeof payload?.userId === "string" ? payload.userId : "";
  const email = typeof payload?.email === "string" ? payload.email : "";
  const role = parseRole(payload?.role);

  if (!userId && !email) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "userId or email is required", correlationId } }, { status: 400 });
  }

  let user = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    : null;

  if (!user && email) {
    const upserted = await db.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash: "",
        role,
        memberStatus: "APPROVED"
      },
      update: {
        role,
        memberStatus: "APPROVED"
      },
      select: { id: true }
    });
    user = upserted;
  }

  if (!user) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "User not found", correlationId } }, { status: 404 });
  }

  const session = createSessionToken(user.id);
  await db.authSession.create({
    data: {
      userId: user.id,
      jti: session.payload.jti,
      expiresAt: new Date(session.payload.exp * 1000)
    }
  });

  const res = NextResponse.json({ ok: true, correlationId });
  setSessionCookie(res, session.token);
  return res;
}

export async function DELETE(req: NextRequest) {
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

