import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AuditLogger } from "../../lib/audit";
import { AppRole, appRoleSchema } from "../../lib/permissions";

const lineSchema = z.object({
  ledgerAccountId: z.string().min(1),
  debitAmountMinor: z.number().int().min(0),
  creditAmountMinor: z.number().int().min(0),
  memo: z.string().optional()
}).refine((line) => (line.debitAmountMinor > 0 && line.creditAmountMinor === 0) || (line.creditAmountMinor > 0 && line.debitAmountMinor === 0), {
  message: "Ledger lines must be one-sided with positive minor amount"
});

const ledgerSourceEntityTypeSchema = z.enum([
  "MATCH",
  "DISPUTE",
  "MANUAL_ADJUSTMENT",
  "CONTRIBUTION_OFFER",
  "RECIPIENT_REQUEST"
]);

const postInputSchema = z.object({
  reference: z.string().min(1),
  description: z.string().optional(),
  correlationId: z.string().min(1),
  sourceEntityType: ledgerSourceEntityTypeSchema,
  sourceEntityId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  actorUserId: z.string().min(1),
  actorRole: appRoleSchema,
  triggerSource: z.string().min(1),
  batchRunId: z.string().optional(),
  lines: z.array(lineSchema).min(2)
});

const reversalInputSchema = z.object({
  originalTransactionId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  reference: z.string().min(1),
  reason: z.string().min(1),
  correlationId: z.string().min(1),
  actorUserId: z.string().min(1),
  actorRole: appRoleSchema,
  triggerSource: z.string().min(1),
  batchRunId: z.string().optional()
});

function isBalanced(lines: Array<{ debitAmountMinor: number; creditAmountMinor: number }>): boolean {
  const debit = lines.reduce((sum, line) => sum + line.debitAmountMinor, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditAmountMinor, 0);
  return debit === credit;
}

export async function postLedgerTransaction(prisma: PrismaClient, auditLogger: AuditLogger, input: z.input<typeof postInputSchema>) {
  const parsed = postInputSchema.parse(input);

  if (!isBalanced(parsed.lines)) {
    throw new Error("Unbalanced ledger transaction: debits must equal credits");
  }

  const existing = await (prisma as any).ledgerTransaction.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: { entries: true } });
  if (existing) {
    return existing;
  }

  const tx = await prisma.$transaction(async (trx) => {
    const created = await (trx as any).ledgerTransaction.create({
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
      await (trx as any).ledgerEntry.create({
        data: {
          ledgerTransactionId: created.id,
          ledgerAccountId: line.ledgerAccountId,
          debitAmountMinor: line.debitAmountMinor,
          creditAmountMinor: line.creditAmountMinor,
          memo: line.memo
        }
      });
    }

    const posted = await (trx as any).ledgerTransaction.update({
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

export async function reverseLedgerTransaction(prisma: PrismaClient, auditLogger: AuditLogger, input: z.input<typeof reversalInputSchema>) {
  const parsed = reversalInputSchema.parse(input);

  const existing = await (prisma as any).ledgerTransaction.findUnique({ where: { idempotencyKey: parsed.idempotencyKey }, include: { entries: true } });
  if (existing) {
    return existing;
  }

  const original = await (prisma as any).ledgerTransaction.findUnique({ where: { id: parsed.originalTransactionId }, include: { entries: true } });
  if (!original) {
    throw new Error("Original ledger transaction not found");
  }

  if (original.status !== "POSTED") {
    throw new Error("Only posted ledger transactions can be reversed");
  }

  const reversed = await prisma.$transaction(async (trx) => {
    const newTx = await (trx as any).ledgerTransaction.create({
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
      await (trx as any).ledgerEntry.create({
        data: {
          ledgerTransactionId: newTx.id,
          ledgerAccountId: line.ledgerAccountId,
          debitAmountMinor: line.creditAmountMinor,
          creditAmountMinor: line.debitAmountMinor,
          memo: `reversal:${line.id}`
        }
      });
    }

    await (trx as any).ledgerTransaction.update({
      where: { id: original.id },
      data: { reversedByTransactionId: newTx.id, status: "REVERSED" }
    });

    const posted = await (trx as any).ledgerTransaction.update({
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

export async function ensurePostedEntryImmutableServiceGuard(prisma: PrismaClient, ledgerEntryId: string, data: { memo?: string }) {
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

export async function ensurePostedEntryDeleteGuard(prisma: PrismaClient, ledgerEntryId: string) {
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

export async function auditDisputeResolution(params: {
  auditLogger: AuditLogger;
  actorUserId: string;
  actorRole: AppRole;
  triggerSource: string;
  correlationId: string;
  batchRunId?: string;
  disputeId: string;
  reason: string;
}) {
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

export async function auditStateTransition(params: {
  auditLogger: AuditLogger;
  actorUserId: string;
  actorRole: AppRole;
  triggerSource: string;
  correlationId: string;
  batchRunId?: string;
  entityType: "MATCH" | "CONTRIBUTION_OFFER" | "RECIPIENT_REQUEST";
  entityId: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
}) {
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
