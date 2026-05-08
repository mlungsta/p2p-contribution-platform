import { z } from "zod";

import { AuditLogger } from "./audit";
import { AppRole, hasPermission } from "./permissions";

const blockedMemberStatuses = new Set(["RESTRICTED", "SUSPENDED"]);
const unresolvedDisputeStatuses = new Set(["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"]);
const activeMatchStatuses = new Set([
  "CREATED",
  "ASSIGNED",
  "AWAITING_PAYMENT",
  "PROOF_UPLOADED",
  "AWAITING_CONFIRMATION",
  "DISPUTED"
]);

const memberStatusSchema = z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "RESTRICTED", "SUSPENDED", "CLOSED"]);
const disputeStatusSchema = z.enum(["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW", "RESOLVED", "CLOSED"]);
const matchStatusSchema = z.enum([
  "CREATED",
  "ASSIGNED",
  "AWAITING_PAYMENT",
  "PROOF_UPLOADED",
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "DISPUTED",
  "RESOLVED",
  "EXPIRED",
  "CANCELLED",
  "COMPLETED"
]);

const minorAmountSchema = z.number().int().positive();
const nonNegativeMinorAmountSchema = z.number().int().min(0);

const offerSchema = z.object({
  id: z.string().min(1),
  payerUserId: z.string().min(1),
  remainingAmountMinor: nonNegativeMinorAmountSchema,
  accumulationWindowClosesAt: z.date(),
  memberStatus: memberStatusSchema,
  unresolvedDisputeStatuses: z.array(disputeStatusSchema).default([])
});

const recipientRequestSchema = z.object({
  id: z.string().min(1),
  recipientUserId: z.string().min(1),
  remainingAmountMinor: nonNegativeMinorAmountSchema,
  memberStatus: memberStatusSchema,
  unresolvedDisputeStatuses: z.array(disputeStatusSchema).default([])
});

const activeMatchSchema = z.object({
  payerUserId: z.string().min(1),
  status: matchStatusSchema
});

const matchingConfigSchema = z.object({
  now: z.date(),
  forceMatchBeforeWindowClose: z.boolean().default(false),
  enableGuaranteedRoi: z.boolean().default(false),
  enableHiddenRotation: z.boolean().default(false),
  enableReferralRewards: z.boolean().default(false)
});

export type MatchCandidate = z.infer<typeof offerSchema>;
export type RecipientRequest = z.infer<typeof recipientRequestSchema>;
export type ActiveMatch = z.infer<typeof activeMatchSchema>;

export interface MatchActorContext {
  actorUserId: string;
  actorRole: AppRole;
  triggerSource: string;
  correlationId: string;
}

interface LockRow {
  id: string;
}

interface TransactionalDb {
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  match: {
    count: (args: { where: { batchRunId: string } }) => Promise<number>;
    findMany: (args: unknown) => Promise<Array<{ senderUserId: string }>>;
    createMany: (args: unknown) => Promise<{ count: number }>;
  };
  contributionOffer: {
    findMany: (args: unknown) => Promise<Array<{
      id: string;
      ownerUserId: string;
      remainingAmountMinor: number;
      accumulationBatchAt: Date | null;
      createdAt: Date;
      owner: { memberStatus: z.infer<typeof memberStatusSchema>; openedDisputes: Array<{ status: z.infer<typeof disputeStatusSchema> }> };
    }>>;
    update: (args: unknown) => Promise<unknown>;
  };
  recipientRequest: {
    findMany: (args: unknown) => Promise<Array<{
      id: string;
      ownerUserId: string;
      remainingAmountMinor: number;
      owner: { memberStatus: z.infer<typeof memberStatusSchema>; openedDisputes: Array<{ status: z.infer<typeof disputeStatusSchema> }> };
    }>>;
    update: (args: unknown) => Promise<unknown>;
  };
  matchingBatchRun: {
    upsert: (args: unknown) => Promise<{ status: "STARTED" | "COMPLETED" | "FAILED" }>;
    update: (args: unknown) => Promise<unknown>;
  };
}

interface MatchingPrismaLike {
  matchingBatchRun: {
    findUnique: (args: { where: { batchRunId: string } }) => Promise<{ status: "STARTED" | "COMPLETED" | "FAILED" } | null>;
  };
  $transaction: <T>(fn: (tx: TransactionalDb) => Promise<T>, options?: { maxWait?: number; timeout?: number }) => Promise<T>;
}

export interface GeneratedMatch {
  id: string;
  matchReference: string;
  batchRunId: string;
  offerId: string;
  payerUserId: string;
  requestId: string;
  recipientUserId: string;
  amountMinor: number;
  status: "ASSIGNED";
  createdAt: Date;
}

export interface BatchMatchInput {
  batchRunId: string;
  idempotencyKey: string;
  offers: MatchCandidate[];
  recipientRequests: RecipientRequest[];
  activeMatches: ActiveMatch[];
  config: z.input<typeof matchingConfigSchema>;
  auditLogger: AuditLogger;
  actor: MatchActorContext;
}

export interface BatchMatchResult {
  createdMatches: GeneratedMatch[];
  skippedOfferIds: string[];
  skippedRequestIds: string[];
}

function hasUnresolvedDispute(statuses: readonly z.infer<typeof disputeStatusSchema>[]): boolean {
  return statuses.some((status) => unresolvedDisputeStatuses.has(status));
}

function userIsBlocked(memberStatus: z.infer<typeof memberStatusSchema>, disputeStatuses: readonly z.infer<typeof disputeStatusSchema>[]): boolean {
  return blockedMemberStatuses.has(memberStatus) || hasUnresolvedDispute(disputeStatuses);
}

function createMatchReference(batchRunId: string, offerId: string, requestId: string, index: number): string {
  return `${batchRunId}:${offerId}:${requestId}:${index + 1}`;
}

function assertForbiddenFeaturesDisabled(config: z.infer<typeof matchingConfigSchema>): void {
  if (config.enableGuaranteedRoi || config.enableHiddenRotation || config.enableReferralRewards) {
    throw new Error("Forbidden feature requested: ROI/hidden rotation/referral rewards are disabled by product rules");
  }
}

function toLockRows(raw: unknown): LockRow[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => ({ id: String(row.id ?? "") }))
    .filter((row) => row.id.length > 0);
}

async function auditMatchCreated(input: {
  auditLogger: AuditLogger;
  actor: MatchActorContext;
  batchRunId: string;
  generatedMatch: GeneratedMatch;
}): Promise<void> {
  const { actor, generatedMatch, auditLogger, batchRunId } = input;
  await auditLogger.log({
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    triggerSource: actor.triggerSource,
    correlationId: actor.correlationId,
    batchRunId,
    action: "matching.batch.assigned",
    entityType: "MATCH",
    entityId: generatedMatch.id,
    dedupeKey: `audit:${batchRunId}:${generatedMatch.matchReference}`,
    beforeState: { status: "CREATED" },
    afterState: { status: "ASSIGNED" },
    metadata: {
      offerId: generatedMatch.offerId,
      requestId: generatedMatch.requestId,
      amountMinor: generatedMatch.amountMinor,
      matchReference: generatedMatch.matchReference
    }
  });
}

export async function runBatchMatching(input: BatchMatchInput): Promise<BatchMatchResult> {
  const config = matchingConfigSchema.parse(input.config);
  assertForbiddenFeaturesDisabled(config);

  const offers = input.offers.map((offer) => offerSchema.parse(offer));
  const requests = input.recipientRequests.map((request) => recipientRequestSchema.parse(request));
  const activeMatches = input.activeMatches.map((m) => activeMatchSchema.parse(m));

  const activePayers = new Set(
    activeMatches.filter((m) => activeMatchStatuses.has(m.status)).map((m) => m.payerUserId)
  );

  const createdMatches: GeneratedMatch[] = [];
  const skippedOfferIds = new Set<string>();
  const skippedRequestIds = new Set<string>();

  for (const offer of offers) {
    if (!config.forceMatchBeforeWindowClose && config.now < offer.accumulationWindowClosesAt) {
      skippedOfferIds.add(offer.id);
      continue;
    }

    if (userIsBlocked(offer.memberStatus, offer.unresolvedDisputeStatuses)) {
      skippedOfferIds.add(offer.id);
      continue;
    }

    if (activePayers.has(offer.payerUserId)) {
      skippedOfferIds.add(offer.id);
      continue;
    }

    let remainingOfferAmountMinor = offer.remainingAmountMinor;

    for (const request of requests) {
      if (remainingOfferAmountMinor <= 0) {
        break;
      }

      if (request.remainingAmountMinor <= 0) {
        continue;
      }

      if (userIsBlocked(request.memberStatus, request.unresolvedDisputeStatuses)) {
        skippedRequestIds.add(request.id);
        continue;
      }

      const allocationMinor = Math.min(remainingOfferAmountMinor, request.remainingAmountMinor);
      if (allocationMinor <= 0) {
        continue;
      }

      remainingOfferAmountMinor -= allocationMinor;
      request.remainingAmountMinor -= allocationMinor;

      const generatedMatch: GeneratedMatch = {
        id: `match_${input.batchRunId}_${createdMatches.length + 1}`,
        matchReference: createMatchReference(input.batchRunId, offer.id, request.id, createdMatches.length),
        batchRunId: input.batchRunId,
        offerId: offer.id,
        payerUserId: offer.payerUserId,
        requestId: request.id,
        recipientUserId: request.recipientUserId,
        amountMinor: allocationMinor,
        status: "ASSIGNED",
        createdAt: config.now
      };

      createdMatches.push(generatedMatch);

      await auditMatchCreated({
        auditLogger: input.auditLogger,
        actor: input.actor,
        batchRunId: input.batchRunId,
        generatedMatch
      });
    }

    if (remainingOfferAmountMinor > 0) {
      skippedOfferIds.add(offer.id);
    }
  }

  return {
    createdMatches,
    skippedOfferIds: Array.from(skippedOfferIds),
    skippedRequestIds: Array.from(skippedRequestIds)
  };
}

export async function runAdminOverrideMatching(params: {
  batchRunId: string;
  offer: MatchCandidate;
  request: RecipientRequest;
  amountMinor: number;
  reason: string;
  actor: MatchActorContext;
  auditLogger: AuditLogger;
  now: Date;
}): Promise<GeneratedMatch> {
  const offer = offerSchema.parse(params.offer);
  const request = recipientRequestSchema.parse(params.request);
  const amountMinor = minorAmountSchema.parse(params.amountMinor);

  if (!params.reason || params.reason.trim().length === 0) {
    throw new Error("Admin override requires a reason");
  }

  if (params.actor.actorRole !== "SUPER_ADMIN" && !hasPermission(params.actor.actorRole, "matching:override")) {
    throw new Error("Forbidden: override requires SUPER_ADMIN or matching:override permission");
  }

  const generatedMatch: GeneratedMatch = {
    id: `match_override_${offer.id}_${request.id}`,
    matchReference: `override:${params.batchRunId}:${offer.id}:${request.id}`,
    batchRunId: params.batchRunId,
    offerId: offer.id,
    payerUserId: offer.payerUserId,
    requestId: request.id,
    recipientUserId: request.recipientUserId,
    amountMinor: Math.min(amountMinor, offer.remainingAmountMinor, request.remainingAmountMinor),
    status: "ASSIGNED",
    createdAt: params.now
  };

  await params.auditLogger.log({
    actorUserId: params.actor.actorUserId,
    actorRole: params.actor.actorRole,
    triggerSource: params.actor.triggerSource,
    correlationId: params.actor.correlationId,
    batchRunId: params.batchRunId,
    action: "matching.admin.override",
    entityType: "MATCH",
    entityId: generatedMatch.id,
    reason: params.reason.trim(),
    dedupeKey: `audit:${params.batchRunId}:${generatedMatch.matchReference}`,
    beforeState: { status: "CREATED" },
    afterState: { status: "ASSIGNED" },
    metadata: {
      offerId: offer.id,
      requestId: request.id,
      amountMinor: generatedMatch.amountMinor,
      reason: params.reason.trim()
    }
  });

  return generatedMatch;
}

export async function runBatchMatchingInTransaction(params: {
  prisma: MatchingPrismaLike;
  batchRunId: string;
  idempotencyKey: string;
  actor: MatchActorContext;
  now: Date;
  auditLogger: AuditLogger;
}): Promise<{ createdCount: number }> {
  const existing = await params.prisma.matchingBatchRun.findUnique({ where: { batchRunId: params.batchRunId } });
  if (existing?.status === "COMPLETED") {
    await params.auditLogger.log({
      actorUserId: params.actor.actorUserId,
      actorRole: params.actor.actorRole,
      triggerSource: params.actor.triggerSource,
      correlationId: params.actor.correlationId,
      batchRunId: params.batchRunId,
      action: "matching.idempotency.collision",
      entityType: "MATCHING_BATCH_RUN",
      entityId: params.batchRunId,
      dedupeKey: `audit:matching-idem:${params.batchRunId}:${params.actor.correlationId}`,
      metadata: { reason: "batch already completed" }
    });
    return { createdCount: 0 };
  }

  return params.prisma.$transaction(async (tx) => {
    let run: { status: "STARTED" | "COMPLETED" | "FAILED" };
    try {
      run = await tx.matchingBatchRun.upsert({
        where: { idempotencyKey: params.idempotencyKey },
        update: {},
        create: {
          batchRunId: params.batchRunId,
          idempotencyKey: params.idempotencyKey,
          status: "STARTED",
          triggerSource: params.actor.triggerSource,
          correlationId: params.actor.correlationId,
          actorUserId: params.actor.actorUserId,
          actorRole: params.actor.actorRole
        }
      });
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === "P2002") {
        await params.auditLogger.log({
          actorUserId: params.actor.actorUserId,
          actorRole: params.actor.actorRole,
          triggerSource: params.actor.triggerSource,
          correlationId: params.actor.correlationId,
          batchRunId: params.batchRunId,
          action: "matching.idempotency.collision",
          entityType: "MATCHING_BATCH_RUN",
          entityId: params.batchRunId,
          dedupeKey: `audit:matching-idem:${params.batchRunId}:${params.actor.correlationId}:p2002`,
          metadata: { reason: "batch upsert unique collision" }
        });
        return { createdCount: 0 };
      }
      throw error;
    }

    if (run.status === "COMPLETED") {
      await params.auditLogger.log({
        actorUserId: params.actor.actorUserId,
        actorRole: params.actor.actorRole,
        triggerSource: params.actor.triggerSource,
        correlationId: params.actor.correlationId,
        batchRunId: params.batchRunId,
        action: "matching.idempotency.collision",
        entityType: "MATCHING_BATCH_RUN",
        entityId: params.batchRunId,
        dedupeKey: `audit:matching-idem:${params.batchRunId}:${params.actor.correlationId}:completed`,
        metadata: { reason: "run already completed during tx" }
      });
      return { createdCount: 0 };
    }

    const alreadyCreated = await tx.match.count({ where: { batchRunId: params.batchRunId } });
    if (alreadyCreated > 0) {
      return { createdCount: 0 };
    }

    const lockedOfferRows = toLockRows(
      await tx.$queryRawUnsafe(
        `SELECT id FROM contribution_offers
         WHERE status IN ('ACTIVE','WAITING_FOR_POOL')
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED`
      )
    );

    const lockedRequestRows = toLockRows(
      await tx.$queryRawUnsafe(
        `SELECT id FROM recipient_requests
         WHERE status IN ('ACTIVE','WAITING_FOR_POOL','PARTIALLY_MATCHED')
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED`
      )
    );

    if (lockedOfferRows.length === 0 || lockedRequestRows.length === 0) {
      await tx.matchingBatchRun.update({
        where: { batchRunId: params.batchRunId },
        data: { status: "COMPLETED", completedAt: new Date() }
      });

      return { createdCount: 0 };
    }

    const activePayers = new Set(
      (await tx.match.findMany({
        where: { status: { in: ["CREATED", "ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION", "DISPUTED"] } },
        select: { senderUserId: true }
      })).map((m) => m.senderUserId)
    );

    const offers = await tx.contributionOffer.findMany({
      where: { id: { in: lockedOfferRows.map((row) => row.id) } },
      include: {
        owner: {
          select: {
            memberStatus: true,
            openedDisputes: { where: { status: { in: ["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"] } }, select: { id: true, status: true } }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const requests = await tx.recipientRequest.findMany({
      where: { id: { in: lockedRequestRows.map((row) => row.id) } },
      include: {
        owner: {
          select: {
            memberStatus: true,
            openedDisputes: { where: { status: { in: ["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"] } }, select: { id: true, status: true } }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const matchResult = await runBatchMatching({
      batchRunId: params.batchRunId,
      idempotencyKey: params.idempotencyKey,
      actor: params.actor,
      offers: offers.map((o) => ({
        id: o.id,
        payerUserId: o.ownerUserId,
        remainingAmountMinor: o.remainingAmountMinor,
        accumulationWindowClosesAt: o.accumulationBatchAt ?? o.createdAt,
        memberStatus: o.owner.memberStatus,
        unresolvedDisputeStatuses: o.owner.openedDisputes.map((d) => d.status)
      })),
      recipientRequests: requests.map((r) => ({
        id: r.id,
        recipientUserId: r.ownerUserId,
        remainingAmountMinor: r.remainingAmountMinor,
        memberStatus: r.owner.memberStatus,
        unresolvedDisputeStatuses: r.owner.openedDisputes.map((d) => d.status)
      })),
      activeMatches: Array.from(activePayers).map((payerUserId) => ({ payerUserId, status: "ASSIGNED" as const })),
      config: { now: params.now },
      auditLogger: params.auditLogger
    });

    let persistedCount = 0;
    for (const m of matchResult.createdMatches) {
      const createResult = await tx.match.createMany({
        data: [{
          matchReference: m.matchReference,
          batchRunId: params.batchRunId,
          contributionOfferId: m.offerId,
          recipientRequestId: m.requestId,
          senderUserId: m.payerUserId,
          recipientUserId: m.recipientUserId,
          amountMinor: m.amountMinor,
          status: "ASSIGNED"
        }],
        skipDuplicates: true
      });
      if (createResult.count === 0) {
        await params.auditLogger.log({
          actorUserId: params.actor.actorUserId,
          actorRole: params.actor.actorRole,
          triggerSource: params.actor.triggerSource,
          action: "MATCH_CONCURRENCY_COLLISION",
          entityType: "MATCH",
          entityId: m.matchReference,
          reason: "unique_constraint_collision",
          correlationId: params.actor.correlationId,
          batchRunId: params.batchRunId,
          metadata: { offerId: m.offerId, requestId: m.requestId, payerUserId: m.payerUserId }
        });
        continue;
      }
      persistedCount += 1;

      await tx.contributionOffer.update({
        where: { id: m.offerId },
        data: {
          remainingAmountMinor: { decrement: m.amountMinor },
          status: { set: "MATCHED" }
        }
      });

      await tx.recipientRequest.update({
        where: { id: m.requestId },
        data: {
          remainingAmountMinor: { decrement: m.amountMinor }
        }
      });
    }

    await tx.matchingBatchRun.update({
      where: { batchRunId: params.batchRunId },
      data: { status: "COMPLETED", completedAt: new Date() }
    });

    return { createdCount: persistedCount };
  }, { maxWait: 10000, timeout: 30000 });
}

