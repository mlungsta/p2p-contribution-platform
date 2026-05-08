"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postLedgerTransaction = postLedgerTransaction;
exports.reverseLedgerTransaction = reverseLedgerTransaction;
exports.ensurePostedEntryImmutableServiceGuard = ensurePostedEntryImmutableServiceGuard;
exports.ensurePostedEntryDeleteGuard = ensurePostedEntryDeleteGuard;
exports.auditDisputeResolution = auditDisputeResolution;
exports.auditStateTransition = auditStateTransition;
const zod_1 = require("zod");
const permissions_1 = require("../../lib/permissions");
const lineSchema = zod_1.z.object({
    ledgerAccountId: zod_1.z.string().min(1),
    debitAmountMinor: zod_1.z.number().int().min(0),
    creditAmountMinor: zod_1.z.number().int().min(0),
    memo: zod_1.z.string().optional()
}).refine((line) => (line.debitAmountMinor > 0 && line.creditAmountMinor === 0) || (line.creditAmountMinor > 0 && line.debitAmountMinor === 0), {
    message: "Ledger lines must be one-sided with positive minor amount"
});
const ledgerSourceEntityTypeSchema = zod_1.z.enum([
    "MATCH",
    "DISPUTE",
    "MANUAL_ADJUSTMENT",
    "CONTRIBUTION_OFFER",
    "RECIPIENT_REQUEST"
]);
const postInputSchema = zod_1.z.object({
    reference: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    correlationId: zod_1.z.string().min(1),
    sourceEntityType: ledgerSourceEntityTypeSchema,
    sourceEntityId: zod_1.z.string().min(1),
    idempotencyKey: zod_1.z.string().min(1),
    actorUserId: zod_1.z.string().min(1),
    actorRole: permissions_1.appRoleSchema,
    triggerSource: zod_1.z.string().min(1),
    batchRunId: zod_1.z.string().optional(),
    lines: zod_1.z.array(lineSchema).min(2)
});
const reversalInputSchema = zod_1.z.object({
    originalTransactionId: zod_1.z.string().min(1),
    idempotencyKey: zod_1.z.string().min(1),
    reference: zod_1.z.string().min(1),
    reason: zod_1.z.string().min(1),
    correlationId: zod_1.z.string().min(1),
    actorUserId: zod_1.z.string().min(1),
    actorRole: permissions_1.appRoleSchema,
    triggerSource: zod_1.z.string().min(1),
    batchRunId: zod_1.z.string().optional()
});
function isBalanced(lines) {
    const debit = lines.reduce((sum, line) => sum + line.debitAmountMinor, 0);
    const credit = lines.reduce((sum, line) => sum + line.creditAmountMinor, 0);
    return debit === credit;
}
async function postLedgerTransaction(prisma, auditLogger, input) {
    const parsed = postInputSchema.parse(input);
    if (!isBalanced(parsed.lines)) {
        throw new Error("Unbalanced ledger transaction: debits must equal credits");
    }
    const existing = await prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: { entries: true } });
    if (existing) {
        return existing;
    }
    const tx = await prisma.$transaction(async (trx) => {
        const created = await trx.ledgerTransaction.create({
            data: {
                reference: parsed.reference,
                description: parsed.description,
                correlationId: parsed.correlationId,
                sourceEntityType: parsed.sourceEntityType,
                sourceEntityId: parsed.sourceEntityId,
                idempotencyKey: parsed.idempotencyKey,
                status: "DRAFT"
            }
        });
        for (const line of parsed.lines) {
            await trx.ledgerEntry.create({
                data: {
                    ledgerTransactionId: created.id,
                    ledgerAccountId: line.ledgerAccountId,
                    debitAmountMinor: line.debitAmountMinor,
                    creditAmountMinor: line.creditAmountMinor,
                    memo: line.memo
                }
            });
        }
        const posted = await trx.ledgerTransaction.update({
            where: { id: created.id },
            data: { status: "POSTED" },
            include: { entries: true }
        });
        return posted;
    });
    await auditLogger.log({
        actorUserId: parsed.actorUserId,
        actorRole: parsed.actorRole,
        triggerSource: parsed.triggerSource,
        correlationId: parsed.correlationId,
        batchRunId: parsed.batchRunId,
        action: "ledger.transaction.posted",
        entityType: "LEDGER_TRANSACTION",
        entityId: tx.id,
        dedupeKey: `audit:ledger:${parsed.idempotencyKey}`,
        beforeState: { status: "DRAFT" },
        afterState: { status: "POSTED" },
        metadata: { sourceEntityType: parsed.sourceEntityType, sourceEntityId: parsed.sourceEntityId }
    });
    return tx;
}
async function reverseLedgerTransaction(prisma, auditLogger, input) {
    const parsed = reversalInputSchema.parse(input);
    const existing = await prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: { entries: true } });
    if (existing) {
        return existing;
    }
    const original = await prisma.ledgerTransaction.findUnique({ where: { id: parsed.originalTransactionId }, include: { entries: true } });
    if (!original) {
        throw new Error("Original ledger transaction not found");
    }
    if (original.status !== "POSTED") {
        throw new Error("Only posted ledger transactions can be reversed");
    }
    const reversed = await prisma.$transaction(async (trx) => {
        const newTx = await trx.ledgerTransaction.create({
            data: {
                reference: parsed.reference,
                description: parsed.reason,
                correlationId: parsed.correlationId,
                sourceEntityType: original.sourceEntityType,
                sourceEntityId: original.sourceEntityId,
                idempotencyKey: parsed.idempotencyKey,
                reversalOfTransactionId: original.id,
                status: "DRAFT"
            }
        });
        for (const line of original.entries) {
            await trx.ledgerEntry.create({
                data: {
                    ledgerTransactionId: newTx.id,
                    ledgerAccountId: line.ledgerAccountId,
                    debitAmountMinor: line.creditAmountMinor,
                    creditAmountMinor: line.debitAmountMinor,
                    memo: `reversal:${line.id}`
                }
            });
        }
        await trx.ledgerTransaction.update({
            where: { id: original.id },
            data: { reversedByTransactionId: newTx.id, status: "REVERSED" }
        });
        const posted = await trx.ledgerTransaction.update({
            where: { id: newTx.id },
            data: { status: "POSTED" },
            include: { entries: true }
        });
        return posted;
    });
    await auditLogger.log({
        actorUserId: parsed.actorUserId,
        actorRole: parsed.actorRole,
        triggerSource: parsed.triggerSource,
        correlationId: parsed.correlationId,
        batchRunId: parsed.batchRunId,
        action: "ledger.transaction.reversed",
        entityType: "LEDGER_TRANSACTION",
        entityId: reversed.id,
        reason: parsed.reason,
        dedupeKey: `audit:ledger-reversal:${parsed.idempotencyKey}`,
        beforeState: { status: "POSTED", originalTransactionId: original.id },
        afterState: { status: "POSTED", reversalOfTransactionId: original.id },
        metadata: { originalTransactionId: original.id }
    });
    return reversed;
}
async function ensurePostedEntryImmutableServiceGuard(prisma, ledgerEntryId, data) {
    const entry = await prisma.ledgerEntry.findUnique({
        where: { id: ledgerEntryId },
        include: { ledgerTransaction: true }
    });
    if (!entry) {
        throw new Error("Ledger entry not found");
    }
    if (entry.ledgerTransaction.status === "POSTED") {
        throw new Error("Cannot update posted ledger entry");
    }
    return prisma.ledgerEntry.update({ where: { id: ledgerEntryId }, data });
}
async function ensurePostedEntryDeleteGuard(prisma, ledgerEntryId) {
    const entry = await prisma.ledgerEntry.findUnique({
        where: { id: ledgerEntryId },
        include: { ledgerTransaction: true }
    });
    if (!entry) {
        throw new Error("Ledger entry not found");
    }
    if (entry.ledgerTransaction.status === "POSTED") {
        throw new Error("Cannot delete posted ledger entry");
    }
    return prisma.ledgerEntry.delete({ where: { id: ledgerEntryId } });
}
async function auditDisputeResolution(params) {
    await params.auditLogger.log({
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        triggerSource: params.triggerSource,
        correlationId: params.correlationId,
        batchRunId: params.batchRunId,
        action: "dispute.resolved",
        entityType: "DISPUTE",
        entityId: params.disputeId,
        reason: params.reason,
        beforeState: { status: "UNDER_REVIEW" },
        afterState: { status: "RESOLVED" },
        dedupeKey: `audit:dispute:${params.disputeId}:${params.correlationId}`
    });
}
async function auditStateTransition(params) {
    await params.auditLogger.log({
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        triggerSource: params.triggerSource,
        correlationId: params.correlationId,
        batchRunId: params.batchRunId,
        action: `${params.entityType.toLowerCase()}.state.transition`,
        entityType: params.entityType,
        entityId: params.entityId,
        reason: params.reason,
        beforeState: { status: params.fromStatus },
        afterState: { status: params.toStatus },
        dedupeKey: `audit:transition:${params.entityType}:${params.entityId}:${params.correlationId}:${params.toStatus}`
    });
}
