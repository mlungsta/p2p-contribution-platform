"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBatchMatching = runBatchMatching;
exports.runAdminOverrideMatching = runAdminOverrideMatching;
exports.runBatchMatchingInTransaction = runBatchMatchingInTransaction;
const zod_1 = require("zod");
const permissions_1 = require("./permissions");
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
const memberStatusSchema = zod_1.z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "RESTRICTED", "SUSPENDED", "CLOSED"]);
const disputeStatusSchema = zod_1.z.enum(["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW", "RESOLVED", "CLOSED"]);
const matchStatusSchema = zod_1.z.enum([
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
const minorAmountSchema = zod_1.z.number().int().positive();
const nonNegativeMinorAmountSchema = zod_1.z.number().int().min(0);
const offerSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    payerUserId: zod_1.z.string().min(1),
    remainingAmountMinor: nonNegativeMinorAmountSchema,
    accumulationWindowClosesAt: zod_1.z.date(),
    memberStatus: memberStatusSchema,
    unresolvedDisputeStatuses: zod_1.z.array(disputeStatusSchema).default([])
});
const recipientRequestSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    recipientUserId: zod_1.z.string().min(1),
    remainingAmountMinor: nonNegativeMinorAmountSchema,
    memberStatus: memberStatusSchema,
    unresolvedDisputeStatuses: zod_1.z.array(disputeStatusSchema).default([])
});
const activeMatchSchema = zod_1.z.object({
    payerUserId: zod_1.z.string().min(1),
    status: matchStatusSchema
});
const matchingConfigSchema = zod_1.z.object({
    now: zod_1.z.date(),
    forceMatchBeforeWindowClose: zod_1.z.boolean().default(false),
    enableGuaranteedRoi: zod_1.z.boolean().default(false),
    enableHiddenRotation: zod_1.z.boolean().default(false),
    enableReferralRewards: zod_1.z.boolean().default(false)
});
function hasUnresolvedDispute(statuses) {
    return statuses.some((status) => unresolvedDisputeStatuses.has(status));
}
function userIsBlocked(memberStatus, disputeStatuses) {
    return blockedMemberStatuses.has(memberStatus) || hasUnresolvedDispute(disputeStatuses);
}
function createMatchReference(batchRunId, offerId, requestId, index) {
    return `${batchRunId}:${offerId}:${requestId}:${index + 1}`;
}
function assertForbiddenFeaturesDisabled(config) {
    if (config.enableGuaranteedRoi || config.enableHiddenRotation || config.enableReferralRewards) {
        throw new Error("Forbidden feature requested: ROI/hidden rotation/referral rewards are disabled by product rules");
    }
}
function toLockRows(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw
        .filter((row) => typeof row === "object" && row !== null)
        .map((row) => ({ id: String(row.id ?? "") }))
        .filter((row) => row.id.length > 0);
}
async function auditMatchCreated(input) {
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
async function runBatchMatching(input) {
    const config = matchingConfigSchema.parse(input.config);
    assertForbiddenFeaturesDisabled(config);
    const offers = input.offers.map((offer) => offerSchema.parse(offer));
    const requests = input.recipientRequests.map((request) => recipientRequestSchema.parse(request));
    const activeMatches = input.activeMatches.map((m) => activeMatchSchema.parse(m));
    const activePayers = new Set(activeMatches.filter((m) => activeMatchStatuses.has(m.status)).map((m) => m.payerUserId));
    const createdMatches = [];
    const skippedOfferIds = new Set();
    const skippedRequestIds = new Set();
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
            const generatedMatch = {
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
async function runAdminOverrideMatching(params) {
    const offer = offerSchema.parse(params.offer);
    const request = recipientRequestSchema.parse(params.request);
    const amountMinor = minorAmountSchema.parse(params.amountMinor);
    if (!params.reason || params.reason.trim().length === 0) {
        throw new Error("Admin override requires a reason");
    }
    if (params.actor.actorRole !== "SUPER_ADMIN" && !(0, permissions_1.hasPermission)(params.actor.actorRole, "matching:override")) {
        throw new Error("Forbidden: override requires SUPER_ADMIN or matching:override permission");
    }
    const generatedMatch = {
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
async function runBatchMatchingInTransaction(params) {
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
        let run;
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
        }
        catch (error) {
            const err = error;
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
        const lockedOfferRows = toLockRows(await tx.$queryRawUnsafe(`SELECT id FROM contribution_offers
         WHERE status IN ('ACTIVE','WAITING_FOR_POOL')
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED`));
        const lockedRequestRows = toLockRows(await tx.$queryRawUnsafe(`SELECT id FROM recipient_requests
         WHERE status IN ('ACTIVE','WAITING_FOR_POOL','PARTIALLY_MATCHED')
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED`));
        if (lockedOfferRows.length === 0 || lockedRequestRows.length === 0) {
            await tx.matchingBatchRun.update({
                where: { batchRunId: params.batchRunId },
                data: { status: "COMPLETED", completedAt: new Date() }
            });
            return { createdCount: 0 };
        }
        const activePayers = new Set((await tx.match.findMany({
            where: { status: { in: ["CREATED", "ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION", "DISPUTED"] } },
            select: { senderUserId: true }
        })).map((m) => m.senderUserId));
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
            activeMatches: Array.from(activePayers).map((payerUserId) => ({ payerUserId, status: "ASSIGNED" })),
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
