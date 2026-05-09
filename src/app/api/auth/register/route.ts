import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth-provider";
import { getCorrelationId } from "@/lib/session-auth";
import { enforceRateLimit } from "@/lib/api-route";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(120).optional(),
  countryCode: z.string().min(2).max(8).optional(),
  timezone: z.string().min(2).max(64).optional()
});

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const limited = await enforceRateLimit(req, "auth", correlationId);
  if (limited) return limited;

  const payload = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid registration payload", correlationId } }, { status: 400 });
  }

  const { email, password, displayName, countryCode, timezone } = parsed.data;

  try {
    const user = await db.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        role: "MEMBER",
        memberStatus: "PENDING_REVIEW",
        memberProfile: displayName
          ? {
              create: {
                displayName,
                countryCode: countryCode ?? null,
                timezone: timezone ?? null
              }
            }
          : undefined
      },
      select: { id: true, email: true, memberStatus: true }
    });

    return NextResponse.json({ ok: true, correlationId, data: user });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "CONSTRAINT_VIOLATION", message: "Registration failed. Email may already exist.", correlationId } }, { status: 409 });
  }
}
