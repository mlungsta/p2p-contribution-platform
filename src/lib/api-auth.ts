import { NextRequest } from "next/server";
import { z } from "zod";
import { appRoleSchema, AppRole } from "./permissions";

const contextSchema = z.object({
  actorUserId: z.string().min(1),
  actorRole: appRoleSchema,
  correlationId: z.string().min(1),
  triggerSource: z.string().min(1),
  batchRunId: z.string().optional()
});

export type ApiRequestContext = z.infer<typeof contextSchema>;

export function parseApiContext(req: NextRequest, fallbackTriggerSource: string): ApiRequestContext {
  const actorRoleRaw = req.headers.get("x-user-role");
  const actorRole: AppRole = appRoleSchema.parse(actorRoleRaw);

  return contextSchema.parse({
    actorUserId: req.headers.get("x-user-id"),
    actorRole,
    correlationId: req.headers.get("x-correlation-id"),
    triggerSource: req.headers.get("x-trigger-source") ?? fallbackTriggerSource,
    batchRunId: req.headers.get("x-batch-run-id") ?? undefined
  });
}

export function requireMemberContext(ctx: ApiRequestContext): void {
  if (ctx.actorRole !== "MEMBER") {
    throw new Error("FORBIDDEN_MEMBER_ROUTE");
  }
}

export function requireAdminContext(ctx: ApiRequestContext): void {
  if (!["OPS_ADMIN", "SUPER_ADMIN"].includes(ctx.actorRole)) {
    throw new Error("FORBIDDEN_ADMIN_ROUTE");
  }
}

export function requireSuperAdmin(ctx: ApiRequestContext): void {
  if (ctx.actorRole !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN_SUPER_ADMIN_REQUIRED");
  }
}

export function requireReadOnlyComplianceOrMember(ctx: ApiRequestContext): void {
  if (!["MEMBER", "COMPLIANCE_REVIEWER", "OPS_ADMIN", "SUPER_ADMIN"].includes(ctx.actorRole)) {
    throw new Error("FORBIDDEN_HISTORY_ROUTE");
  }
}
