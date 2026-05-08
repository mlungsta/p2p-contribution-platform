import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth-provider";
import { enforceRateLimit } from "@/lib/api-route";
import { getCorrelationId } from "@/lib/session-auth";
import { AuthServiceError, AuthSessionService } from "@/server/services/auth-session-service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "auth", correlationId);
  if (limited) return limited;

  const payload = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid login payload", correlationId } }, { status: 400 });
  }

  const service = new AuthSessionService(db);
  try {
    const login = await service.loginWithCredentials(parsed.data.email, parsed.data.password);
    const res = NextResponse.json({ ok: true, correlationId });
    setSessionCookie(res, login.token);
    return res;
  } catch (error) {
    const res = NextResponse.json(
      {
        ok: false,
        error: {
          code: error instanceof AuthServiceError ? error.code : "UNAUTHORIZED",
          message: error instanceof AuthServiceError ? error.message : "Invalid credentials",
          correlationId
        }
      },
      { status: error instanceof AuthServiceError && error.code === "FORBIDDEN" ? 403 : 401 }
    );
    clearSessionCookie(res);
    return res;
  }
}

