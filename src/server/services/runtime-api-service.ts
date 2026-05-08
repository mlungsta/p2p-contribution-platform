import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createAuditService, AuditLogger, AuditRepository } from "../../lib/audit";
import { appRoleSchema, AppRole, hasPermission } from "../../lib/permissions";
import { runBatchMatchingInTransaction, runAdminOverrideMatching } from "../../lib/matching";
import { structuredLogger } from "../../lib/logger";
import { captureError } from "../../lib/error-monitoring";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "CONSTRAINT_VIOLATION"
  | "SAFE_MODE_BLOCKED"
  | "INTERNAL_ERROR";

export class ApiServiceError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly correlationId: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export type ApiResult<T> =
  | { ok: true; data: T; correlationId: string }
  | { ok: false; error: { code: ApiErrorCode; message: string; correlationId: string } };

const moneyMinorSchema = z.number().int().positive();
const idSchema = z.string().min(1);

const contextSchema = z.object({
  actorUserId: idSchema,
  actorRole: appRoleSchema,
  correlationId: z.string().min(1),
  triggerSource: z.string().min(1),
  batchRunId: z.string().optional()
});

const createOfferSchema = z.object({
  amountMinor: moneyMinorSchema,
  currency: z.string().min(3).max(10).default("USD")
});

const createRecipientRequestSchema = z.object({
  amountMinor: moneyMinorSchema,
  currency: z.string().min(3).max(10).default("USD"),
  expiresAt: z.string().datetime().optional()
});

const runBatchSchema = z.object({
  batchRunId: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

const proofUploadSchema = z.object({
  matchId: idSchema,
  fileUrl: z.string().url(),
  note: z.string().optional()
});

const confirmReceiptSchema = z.object({
  matchId: idSchema
});

const openDisputeSchema = z.object({
  matchId: idSchema,
  reason: z.string().min(3)
});

const resolveDisputeSchema = z.object({
  disputeId: idSchema,
  resolutionNote: z.string().min(3)
});

const adminOverrideSchema = z.object({
  batchRunId: z.string().min(1),
  offerId: idSchema,
  requestId: idSchema,
  amountMinor: moneyMinorSchema,
  reason: z.string().min(3)
});
const safeModeSchema = z.object({
  enabled: z.boolean()
});

class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(entry: Parameters<AuditLogger["log"]>[0]): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        actorRole: entry.actorRole,
        triggerSource: entry.triggerSource,
        correlationId: entry.correlationId,
        batchRunId: entry.batchRunId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeState: (entry.beforeState as Prisma.JsonObject | undefined) ?? undefined,
        afterState: (entry.afterState as Prisma.JsonObject | undefined) ?? undefined,
        reason: entry.reason,
        metadata: (entry.metadata as Prisma.JsonObject | undefined) ?? undefined,
        dedupeKey: entry.dedupeKey,
        occurredAt: entry.occurredAt
      }
    });
  }
}

function requireRole(ctx: RuntimeContext, allowed: AppRole[]): void {
  if (!allowed.includes(ctx.actorRole)) {
    throw new ApiServiceError("FORBIDDEN", "Permission denied", ctx.correlationId, 403);
  }
}

function requireSuperOrPermission(ctx: RuntimeContext, permission: Parameters<typeof hasPermission>[1]): void {
  if (ctx.actorRole === "SUPER_ADMIN") {
    return;
  }

  if (!hasPermission(ctx.actorRole, permission)) {
    throw new ApiServiceError("FORBIDDEN", "Permission denied", ctx.correlationId, 403);
  }
}

async function isSafeModeActive(prisma: PrismaClient): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "SAFE_MODE" } });
  if (!setting) return false;

  const value = setting.value as { enabled?: boolean };
  return value?.enabled === true;
}

function mapPrismaError(error: unknown, correlationId: string): ApiServiceError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return new ApiServiceError("CONSTRAINT_VIOLATION", "Duplicate record", correlationId, 409);
    if (error.code === "P2003") return new ApiServiceError("NOT_FOUND", "Related record not found", correlationId, 404);
    if (error.code === "P2025") return new ApiServiceError("NOT_FOUND", "Record not found", correlationId, 404);
    if (error.code === "P2010") return new ApiServiceError("CONSTRAINT_VIOLATION", "Operation violates data constraints", correlationId, 409);
  }

  if (error instanceof z.ZodError) {
    return new ApiServiceError("VALIDATION_ERROR", error.issues.map((i) => i.message).join(", "), correlationId, 400);
  }

  if (error instanceof ApiServiceError) {
    return error;
  }

  return new ApiServiceError("INTERNAL_ERROR", "Unexpected internal error", correlationId, 500);
}

async function auditedTransition(params: {
  audit: AuditLogger;
  ctx: RuntimeContext;
  action: string;
  entityType: string;
  entityId: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
}) {
  await params.audit.log({
    actorUserId: params.ctx.actorUserId,
    actorRole: params.ctx.actorRole,
    triggerSource: params.ctx.triggerSource,
    correlationId: params.ctx.correlationId,
    batchRunId: params.ctx.batchRunId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    reason: params.reason,
    beforeState: { status: params.fromStatus },
    afterState: { status: params.toStatus },
    dedupeKey: `audit:transition:${params.entityType}:${params.entityId}:${params.ctx.correlationId}:${params.toStatus}`
  });
}

export type RuntimeContext = z.infer<typeof contextSchema>;

export class RuntimeApiService {
  private readonly audit: AuditLogger;

  constructor(private readonly prisma: PrismaClient) {
    this.audit = createAuditService(new PrismaAuditRepository(prisma));
  }

  static parseContext(input: unknown): RuntimeContext {
    return contextSchema.parse(input);
  }

  async createContributionOffer(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    const payload = createOfferSchema.parse(payloadInput);

    requireRole(ctx, ["MEMBER"]);

    const safeMode = await isSafeModeActive(this.prisma);
    const status = safeMode ? "WAITING_FOR_POOL" : "ACTIVE";

    const offer = await this.prisma.contributionOffer.create({
      data: {
        ownerUserId: ctx.actorUserId,
        amountMinor: payload.amountMinor,
        remainingAmountMinor: payload.amountMinor,
        currency: payload.currency,
        status
      }
    });

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      actorRole: ctx.actorRole,
      triggerSource: ctx.triggerSource,
      correlationId: ctx.correlationId,
      action: "contribution.offer.created",
      entityType: "CONTRIBUTION_OFFER",
      entityId: offer.id,
      afterState: { status }
    });

    return offer;
  }

  async createRecipientRequest(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    const payload = createRecipientRequestSchema.parse(payloadInput);

    requireRole(ctx, ["MEMBER"]);

    const request = await this.prisma.recipientRequest.create({
      data: {
        ownerUserId: ctx.actorUserId,
        amountMinor: payload.amountMinor,
        remainingAmountMinor: payload.amountMinor,
        currency: payload.currency,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        status: "ACTIVE"
      }
    });

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      actorRole: ctx.actorRole,
      triggerSource: ctx.triggerSource,
      correlationId: ctx.correlationId,
      action: "recipient.request.created",
      entityType: "RECIPIENT_REQUEST",
      entityId: request.id,
      afterState: { status: request.status }
    });

    return request;
  }

  async runBatchMatching(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    const payload = runBatchSchema.parse(payloadInput);

    requireSuperOrPermission(ctx, "match:review");

    const safeMode = await isSafeModeActive(this.prisma);
    if (safeMode && ctx.actorRole !== "SUPER_ADMIN") {
      throw new ApiServiceError("SAFE_MODE_BLOCKED", "Safe mode blocks new matching cycles for non-SUPER_ADMIN actors", ctx.correlationId, 409);
    }

    return runBatchMatchingInTransaction({
      prisma: this.prisma as never,
      batchRunId: payload.batchRunId,
      idempotencyKey: payload.idempotencyKey,
      actor: {
        actorUserId: ctx.actorUserId,
        actorRole: ctx.actorRole,
        triggerSource: ctx.triggerSource,
        correlationId: ctx.correlationId
      },
      now: new Date(),
      auditLogger: this.audit
    });
  }

  async uploadProofMetadata(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    const payload = proofUploadSchema.parse(payloadInput);

    requireRole(ctx, ["MEMBER"]);

    const safeMode = await isSafeModeActive(this.prisma);
    const match = await this.prisma.match.findUnique({ where: { id: payload.matchId } });
    if (!match) throw new ApiServiceError("NOT_FOUND", "Match not found", ctx.correlationId, 404);

    if (match.senderUserId !== ctx.actorUserId) {
      throw new ApiServiceError("FORBIDDEN", "Only payer can upload proof", ctx.correlationId, 403);
    }

    const proof = await this.prisma.proofOfPayment.create({
      data: {
        matchId: payload.matchId,
        uploadedByUserId: ctx.actorUserId,
        fileUrl: payload.fileUrl,
        note: payload.note,
        status: "SUBMITTED"
      }
    });

    const previousStatus = match.status;
    const nextStatus = safeMode ? "PROOF_UPLOADED" : "AWAITING_CONFIRMATION";

    await this.prisma.match.update({ where: { id: match.id }, data: { status: nextStatus } });
    await auditedTransition({
      audit: this.audit,
      ctx,
      action: "match.state.transition",
      entityType: "MATCH",
      entityId: match.id,
      fromStatus: previousStatus,
      toStatus: nextStatus
    });

    return proof;
  }

  async confirmReceipt(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    const payload = confirmReceiptSchema.parse(payloadInput);

    requireRole(ctx, ["MEMBER"]);

    const match = await this.prisma.match.findUnique({ where: { id: payload.matchId } });
    if (!match) throw new ApiServiceError("NOT_FOUND", "Match not found", ctx.correlationId, 404);

    if (match.recipientUserId !== ctx.actorUserId) {
      throw new ApiServiceError("FORBIDDEN", "Only recipient can confirm receipt", ctx.correlationId, 403);
    }

    if (!["AWAITING_CONFIRMATION", "PROOF_UPLOADED"].includes(match.status)) {
      throw new ApiServiceError("INVALID_STATE", "Match is not ready for confirmation", ctx.correlationId, 409);
    }

    await this.prisma.match.update({ where: { id: match.id }, data: { status: "CONFIRMED" } });

    await auditedTransition({
      audit: this.audit,
      ctx,
      action: "match.state.transition",
      entityType: "MATCH",
      entityId: match.id,
      fromStatus: match.status,
      toStatus: "CONFIRMED"
    });

    return { matchId: match.id, status: "CONFIRMED" };
  }

  async openDispute(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    const payload = openDisputeSchema.parse(payloadInput);

    requireRole(ctx, ["MEMBER"]);

    const safeMode = await isSafeModeActive(this.prisma);
    if (safeMode) {
      throw new ApiServiceError("SAFE_MODE_BLOCKED", "Safe mode freezes disputes", ctx.correlationId, 409);
    }

    const match = await this.prisma.match.findUnique({ where: { id: payload.matchId } });
    if (!match) throw new ApiServiceError("NOT_FOUND", "Match not found", ctx.correlationId, 404);

    if (![match.senderUserId, match.recipientUserId].includes(ctx.actorUserId)) {
      throw new ApiServiceError("FORBIDDEN", "Only involved participants can open a dispute", ctx.correlationId, 403);
    }

    if (!["ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION"].includes(match.status)) {
      throw new ApiServiceError("INVALID_STATE", "Dispute cannot be opened from current match state", ctx.correlationId, 409);
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        matchId: match.id,
        openedByUserId: ctx.actorUserId,
        reason: payload.reason,
        status: "OPEN"
      }
    });

    await this.prisma.match.update({ where: { id: match.id }, data: { status: "DISPUTED" } });

    await auditedTransition({
      audit: this.audit,
      ctx,
      action: "match.state.transition",
      entityType: "MATCH",
      entityId: match.id,
      fromStatus: match.status,
      toStatus: "DISPUTED",
      reason: payload.reason
    });

    return dispute;
  }

  async resolveDispute(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    const payload = resolveDisputeSchema.parse(payloadInput);

    requireRole(ctx, ["OPS_ADMIN", "SUPER_ADMIN"]);

    const dispute = await this.prisma.dispute.findUnique({ where: { id: payload.disputeId }, include: { match: true } });
    if (!dispute) throw new ApiServiceError("NOT_FOUND", "Dispute not found", ctx.correlationId, 404);

    if (!["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"].includes(dispute.status)) {
      throw new ApiServiceError("INVALID_STATE", "Dispute is not in resolvable state", ctx.correlationId, 409);
    }

    await this.prisma.dispute.update({ where: { id: dispute.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    await this.prisma.match.update({ where: { id: dispute.matchId }, data: { status: "RESOLVED" } });

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      actorRole: ctx.actorRole,
      triggerSource: ctx.triggerSource,
      correlationId: ctx.correlationId,
      action: "dispute.resolved",
      entityType: "DISPUTE",
      entityId: dispute.id,
      reason: payload.resolutionNote,
      beforeState: { status: dispute.status },
      afterState: { status: "RESOLVED" }
    });

    return { disputeId: dispute.id, status: "RESOLVED" };
  }

  async viewMemberStatusHistory(ctxInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);

    if (ctx.actorRole === "COMPLIANCE_REVIEWER") {
      return this.prisma.user.findUnique({
        where: { id: ctx.actorUserId },
        include: {
          contributionOffers: true,
          recipientRequests: true,
          sentMatches: true,
          receivedMatches: true,
          openedDisputes: true
        }
      });
    }

    requireRole(ctx, ["MEMBER", "OPS_ADMIN", "SUPER_ADMIN"]);

    return this.prisma.user.findUnique({
      where: { id: ctx.actorUserId },
      include: {
        contributionOffers: true,
        recipientRequests: true,
        sentMatches: true,
        receivedMatches: true,
        openedDisputes: true
      }
    });
  }

  async adminOverride(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    const payload = adminOverrideSchema.parse(payloadInput);

    requireSuperOrPermission(ctx, "matching:override");

    if (ctx.actorRole !== "SUPER_ADMIN") {
      throw new ApiServiceError("FORBIDDEN", "Only SUPER_ADMIN can execute override", ctx.correlationId, 403);
    }

    const safeMode = await isSafeModeActive(this.prisma);
    if (safeMode && ctx.actorRole !== "SUPER_ADMIN") {
      throw new ApiServiceError("SAFE_MODE_BLOCKED", "Safe mode blocks override", ctx.correlationId, 409);
    }

    const offer = await this.prisma.contributionOffer.findUnique({
      where: { id: payload.offerId },
      include: {
        owner: {
          select: {
            memberStatus: true,
            openedDisputes: { where: { status: { in: ["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"] } }, select: { status: true } }
          }
        }
      }
    });

    const request = await this.prisma.recipientRequest.findUnique({
      where: { id: payload.requestId },
      include: {
        owner: {
          select: {
            memberStatus: true,
            openedDisputes: { where: { status: { in: ["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"] } }, select: { status: true } }
          }
        }
      }
    });

    if (!offer || !request) {
      throw new ApiServiceError("NOT_FOUND", "Offer or request not found", ctx.correlationId, 404);
    }

    return runAdminOverrideMatching({
      batchRunId: payload.batchRunId,
      amountMinor: payload.amountMinor,
      reason: payload.reason,
      actor: {
        actorUserId: ctx.actorUserId,
        actorRole: ctx.actorRole,
        triggerSource: ctx.triggerSource,
        correlationId: ctx.correlationId
      },
      auditLogger: this.audit,
      now: new Date(),
      offer: {
        id: offer.id,
        payerUserId: offer.ownerUserId,
        remainingAmountMinor: offer.remainingAmountMinor,
        accumulationWindowClosesAt: offer.accumulationBatchAt ?? offer.createdAt,
        memberStatus: offer.owner.memberStatus,
        unresolvedDisputeStatuses: offer.owner.openedDisputes.map((d) => d.status)
      },
      request: {
        id: request.id,
        recipientUserId: request.ownerUserId,
        remainingAmountMinor: request.remainingAmountMinor,
        memberStatus: request.owner.memberStatus,
        unresolvedDisputeStatuses: request.owner.openedDisputes.map((d) => d.status)
      }
    });
  }

  async viewAuditLogs(ctxInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    requireSuperOrPermission(ctx, "audit:view");

    const logs = await this.prisma.auditLog.findMany({
      orderBy: { occurredAt: "desc" },
      take: 100,
      select: {
        occurredAt: true,
        actorUserId: true,
        actorRole: true,
        action: true,
        entityType: true,
        entityId: true,
        correlationId: true,
        batchRunId: true
      }
    });

    return logs;
  }

  async getSafeMode(ctxInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    requireRole(ctx, ["OPS_ADMIN", "SUPER_ADMIN", "COMPLIANCE_REVIEWER"]);
    return { enabled: await isSafeModeActive(this.prisma) };
  }

  async setSafeMode(ctxInput: unknown, payloadInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    requireRole(ctx, ["SUPER_ADMIN"]);
    const payload = safeModeSchema.parse(payloadInput);

    await this.prisma.systemSetting.upsert({
      where: { key: "SAFE_MODE" },
      create: { key: "SAFE_MODE", value: { enabled: payload.enabled } },
      update: { value: { enabled: payload.enabled } }
    });

    await this.audit.log({
      actorUserId: ctx.actorUserId,
      actorRole: ctx.actorRole,
      triggerSource: ctx.triggerSource,
      correlationId: ctx.correlationId,
      action: "system.safe_mode.updated",
      entityType: "SYSTEM_SETTING",
      entityId: "SAFE_MODE",
      afterState: { enabled: payload.enabled }
    });

    return { enabled: payload.enabled };
  }

  async getOverrideContext(ctxInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    requireRole(ctx, ["SUPER_ADMIN"]);

    const [offers, requests] = await Promise.all([
      this.prisma.contributionOffer.findMany({
        where: { status: { in: ["ACTIVE", "WAITING_FOR_POOL", "MATCHED"] }, remainingAmountMinor: { gt: 0 } },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: { id: true, remainingAmountMinor: true, status: true, ownerUserId: true }
      }),
      this.prisma.recipientRequest.findMany({
        where: { status: { in: ["ACTIVE", "PARTIALLY_MATCHED", "WAITING_FOR_POOL"] }, remainingAmountMinor: { gt: 0 } },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: { id: true, remainingAmountMinor: true, status: true, ownerUserId: true }
      })
    ]);

    return { offers, requests };
  }

  async listResolvableDisputes(ctxInput: unknown) {
    const ctx = RuntimeApiService.parseContext(ctxInput);
    requireRole(ctx, ["OPS_ADMIN", "SUPER_ADMIN", "COMPLIANCE_REVIEWER"]);

    return this.prisma.dispute.findMany({
      where: { status: { in: ["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"] } },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, status: true, matchId: true, openedByUserId: true }
    });
  }
}

export async function executeWithErrorHandling<T>(ctx: RuntimeContext, fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, correlationId: ctx.correlationId };
  } catch (error) {
    const mapped = mapPrismaError(error, ctx.correlationId);
    structuredLogger.error("runtime_api_error", {
      correlationId: ctx.correlationId,
      actorId: ctx.actorUserId,
      action: "runtime_api",
      details: {
        code: mapped.code,
        status: mapped.status,
        internal_error_class: error instanceof Error ? error.name : "unknown"
      }
    });

    return {
      ok: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        correlationId: mapped.correlationId
      }
    };
  }
}



