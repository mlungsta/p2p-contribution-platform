import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";

const prisma = new PrismaClient();

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

async function main() {
  const userEmail = `${uid("member")}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: userEmail,
      passwordHash: "hashed-password-value",
      role: "MEMBER",
      memberStatus: "APPROVED"
    }
  });

  await assert.rejects(
    prisma.user.create({
      data: {
        email: userEmail,
        passwordHash: "another-hash",
        role: "MEMBER",
        memberStatus: "APPROVED"
      }
    })
  );

  await assert.rejects(
    prisma.user.create({
      data: {
        email: `${uid("invalid")}@example.com`
      }
    })
  );

  const payer = user;
  const recipient = await prisma.user.create({
    data: {
      email: `${uid("recipient")}@example.com`,
      passwordHash: "hashed-password-value",
      role: "MEMBER",
      memberStatus: "APPROVED"
    }
  });

  const offer = await prisma.contributionOffer.create({
    data: {
      ownerUserId: payer.id,
      amountMinor: 10000,
      remainingAmountMinor: 10000,
      status: "ACTIVE"
    }
  });

  const request = await prisma.recipientRequest.create({
    data: {
      ownerUserId: recipient.id,
      amountMinor: 10000,
      remainingAmountMinor: 10000,
      status: "ACTIVE"
    }
  });

  const batchRun = await prisma.matchingBatchRun.create({
    data: {
      batchRunId: uid("batch"),
      idempotencyKey: uid("idem"),
      triggerSource: "test",
      correlationId: uid("corr"),
      actorUserId: payer.id,
      actorRole: "SUPER_ADMIN"
    }
  });

  const matchRef = uid("matchref");

  await prisma.match.create({
    data: {
      matchReference: matchRef,
      batchRunId: batchRun.batchRunId,
      contributionOfferId: offer.id,
      recipientRequestId: request.id,
      senderUserId: payer.id,
      recipientUserId: recipient.id,
      amountMinor: 5000,
      status: "ASSIGNED"
    }
  });

  await assert.rejects(
    prisma.match.create({
      data: {
        matchReference: uid("otherref"),
        batchRunId: batchRun.batchRunId,
        contributionOfferId: offer.id,
        recipientRequestId: request.id,
        senderUserId: payer.id,
        recipientUserId: recipient.id,
        amountMinor: 5000,
        status: "ASSIGNED"
      }
    })
  );

  await assert.rejects(
    prisma.match.create({
      data: {
        matchReference: matchRef,
        batchRunId: uid("otherbatch"),
        contributionOfferId: offer.id,
        recipientRequestId: request.id,
        senderUserId: payer.id,
        recipientUserId: recipient.id,
        amountMinor: 1000,
        status: "ASSIGNED"
      }
    })
  );

  // Active payer unique constraint (partial unique index)
  await assert.rejects(
    prisma.match.create({
      data: {
        matchReference: uid("active-payer-conflict"),
        batchRunId: uid("batch"),
        contributionOfferId: offer.id,
        recipientRequestId: request.id,
        senderUserId: payer.id,
        recipientUserId: recipient.id,
        amountMinor: 1000,
        status: "AWAITING_PAYMENT"
      }
    })
  );

  await prisma.auditLog.create({
    data: {
      actorUserId: payer.id,
      actorRole: "SUPER_ADMIN",
      triggerSource: "test",
      correlationId: uid("corr"),
      batchRunId: batchRun.batchRunId,
      action: "matching.batch.assigned",
      entityType: "MATCH",
      entityId: matchRef,
      occurredAt: new Date()
    }
  });

  await assert.rejects(
    prisma.auditLog.create({
      data: {
        actorUserId: payer.id,
        actorRole: "SUPER_ADMIN",
        triggerSource: "test",
        correlationId: uid("corr"),
        action: "matching.batch.assigned",
        entityType: "MATCH"
      }
    })
  );

  // Monetary CHECK constraints
  await assert.rejects(
    prisma.contributionOffer.create({
      data: {
        ownerUserId: payer.id,
        amountMinor: 0,
        remainingAmountMinor: 0,
        status: "ACTIVE"
      }
    })
  );

  await assert.rejects(
    prisma.recipientRequest.create({
      data: {
        ownerUserId: recipient.id,
        amountMinor: 100,
        remainingAmountMinor: 101,
        status: "ACTIVE"
      }
    })
  );

  // Ledger posting invariant + immutability constraints
  const accountA = await prisma.ledgerAccount.create({
    data: { code: uid("acct_a"), name: "Account A", accountType: "ASSET" }
  });
  const accountB = await prisma.ledgerAccount.create({
    data: { code: uid("acct_b"), name: "Account B", accountType: "LIABILITY" }
  });

  const tx = await prisma.ledgerTransaction.create({
    data: {
      reference: uid("tx"),
      status: "DRAFT",
      correlationId: uid("corr"),
      sourceEntityType: "MANUAL_ADJUSTMENT",
      sourceEntityId: uid("source"),
      idempotencyKey: uid("idem")
    }
  });

  await prisma.ledgerEntry.create({
    data: {
      ledgerTransactionId: tx.id,
      ledgerAccountId: accountA.id,
      debitAmountMinor: 1000,
      creditAmountMinor: 0
    }
  });

  await prisma.ledgerEntry.create({
    data: {
      ledgerTransactionId: tx.id,
      ledgerAccountId: accountB.id,
      debitAmountMinor: 0,
      creditAmountMinor: 1000
    }
  });

  await prisma.ledgerTransaction.update({
    where: { id: tx.id },
    data: { status: "POSTED" }
  });

  await assert.rejects(
    prisma.ledgerEntry.updateMany({
      where: { ledgerTransactionId: tx.id },
      data: { memo: "should fail - posted immutable" }
    })
  );

  const unbalancedTx = await prisma.ledgerTransaction.create({
    data: {
      reference: uid("tx_unbalanced"),
      status: "DRAFT",
      correlationId: uid("corr"),
      sourceEntityType: "MANUAL_ADJUSTMENT",
      sourceEntityId: uid("source"),
      idempotencyKey: uid("idem")
    }
  });
  await prisma.ledgerEntry.create({
    data: {
      ledgerTransactionId: unbalancedTx.id,
      ledgerAccountId: accountA.id,
      debitAmountMinor: 500,
      creditAmountMinor: 0
    }
  });
  await assert.rejects(
    prisma.ledgerTransaction.update({
      where: { id: unbalancedTx.id },
      data: { status: "POSTED" }
    })
  );

  console.log("Schema DB tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
