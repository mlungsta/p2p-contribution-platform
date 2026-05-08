import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { appRoleSchema } from "./permissions";
import { resolveAuthenticatedSession, getCorrelationId, AuthBoundaryError } from "./session-auth";

export interface RouteContext {
  actorUserId: string;
  actorRole: ReturnType<typeof appRoleSchema.parse>;
  correlationId: string;
  triggerSource: string;
  batchRunId?: string;
}

export async function buildRouteContext(req: NextRequest, prisma: PrismaClient, triggerSource: string): Promise<RouteContext> {
  const session = await resolveAuthenticatedSession(req, prisma);
  return {
    actorUserId: session.actorUserId,
    actorRole: session.actorRole,
    correlationId: getCorrelationId(req),
    triggerSource,
    batchRunId: req.headers.get("x-batch-run-id") ?? undefined
  };
}

export function routeErrorResponse(error: unknown, correlationId: string) {
  if (error instanceof AuthBoundaryError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          correlationId
        }
      },
      { status: error.code === "UNAUTHORIZED" ? 401 : 403 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected internal error",
        correlationId
      }
    },
    { status: 500 }
  );
}

export function requireMemberRoute(role: string): void {
  if (role !== "MEMBER") {
    throw new AuthBoundaryError("FORBIDDEN", "Member access required");
  }
}

export function requireAdminRoute(role: string): void {
  if (!["OPS_ADMIN", "SUPER_ADMIN"].includes(role)) {
    throw new AuthBoundaryError("FORBIDDEN", "Admin access required");
  }
}

export function requireSuperAdminRoute(role: string): void {
  if (role !== "SUPER_ADMIN") {
    throw new AuthBoundaryError("FORBIDDEN", "Super admin access required");
  }
}

export function requireReadOnlyHistoryRoute(role: string): void {
  if (!["MEMBER", "COMPLIANCE_REVIEWER", "OPS_ADMIN", "SUPER_ADMIN"].includes(role)) {
    throw new AuthBoundaryError("FORBIDDEN", "Read access required");
  }
}
