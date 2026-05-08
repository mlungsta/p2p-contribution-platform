import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    const memberA = await prisma.user.upsert({
      where: { email: "e2e.membera@example.com" },
      create: { email: "e2e.membera@example.com", passwordHash: "h", role: "MEMBER", memberStatus: "APPROVED" },
      update: { role: "MEMBER", memberStatus: "APPROVED" }
    });
    const memberB = await prisma.user.upsert({
      where: { email: "e2e.memberb@example.com" },
      create: { email: "e2e.memberb@example.com", passwordHash: "h", role: "MEMBER", memberStatus: "APPROVED" },
      update: { role: "MEMBER", memberStatus: "APPROVED" }
    });
    const payer = await prisma.user.upsert({
      where: { email: "e2e.payer@example.com" },
      create: { email: "e2e.payer@example.com", passwordHash: "h", role: "MEMBER", memberStatus: "APPROVED" },
      update: { role: "MEMBER", memberStatus: "APPROVED" }
    });
    const opsAdmin = await prisma.user.upsert({
      where: { email: "e2e.ops@example.com" },
      create: { email: "e2e.ops@example.com", passwordHash: "h", role: "OPS_ADMIN", memberStatus: "APPROVED" },
      update: { role: "OPS_ADMIN", memberStatus: "APPROVED" }
    });
    const superAdmin = await prisma.user.upsert({
      where: { email: "e2e.super@example.com" },
      create: { email: "e2e.super@example.com", passwordHash: "h", role: "SUPER_ADMIN", memberStatus: "APPROVED" },
      update: { role: "SUPER_ADMIN", memberStatus: "APPROVED" }
    });

    const offer = await prisma.contributionOffer.create({
      data: {
        ownerUserId: payer.id,
        amountMinor: 12000,
        remainingAmountMinor: 12000,
        currency: "USD",
        status: "ACTIVE"
      }
    });

    const request = await prisma.recipientRequest.create({
      data: {
        ownerUserId: memberB.id,
        amountMinor: 12000,
        remainingAmountMinor: 12000,
        currency: "USD",
        status: "ACTIVE"
      }
    });

    const existingActiveMatch = await prisma.match.findFirst({
      where: { senderUserId: payer.id, status: { in: ["CREATED", "ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION", "DISPUTED"] } },
      orderBy: { createdAt: "desc" }
    });

    const disputeReadyMatch = existingActiveMatch ?? await prisma.match.create({
      data: {
        matchReference: `e2e_match_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
        batchRunId: `e2e_batch_${Date.now()}`,
        contributionOfferId: offer.id,
        recipientRequestId: request.id,
        senderUserId: payer.id,
        recipientUserId: memberA.id,
        amountMinor: 1000,
        status: "ASSIGNED"
      }
    });

    await prisma.dispute.updateMany({
      where: { matchId: disputeReadyMatch.id, status: { in: ["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"] } },
      data: { status: "RESOLVED", resolvedAt: new Date() }
    });
    await prisma.match.update({
      where: { id: disputeReadyMatch.id },
      data: { status: "ASSIGNED" }
    });

    await prisma.systemSetting.upsert({
      where: { key: "SAFE_MODE" },
      create: { key: "SAFE_MODE", value: { enabled: false } },
      update: { value: { enabled: false } }
    });

    const statePath = path.join(process.cwd(), "tests", "e2e", ".state.json");
    fs.writeFileSync(statePath, JSON.stringify({
      memberAId: memberA.id,
      memberBId: memberB.id,
      opsAdminId: opsAdmin.id,
      superAdminId: superAdmin.id,
      disputeReadyMatchId: disputeReadyMatch.id
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;
