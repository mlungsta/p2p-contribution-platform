import { MatchStatus, PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";

type StatePayload = {
  memberAId: string;
  memberBId: string;
  opsAdminId: string;
  superAdminId: string;
  disputeReadyMatchId: string;
  proofReadyMatchId: string;
  memberEmail: string;
  opsEmail: string;
  superEmail: string;
  loginPassword: string;
};

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `s2:${salt}:${derived}`;
}

const ACTIVE_MATCH_STATES: MatchStatus[] = ["CREATED", "ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION", "DISPUTED"];

async function globalSetup() {
  const prisma = new PrismaClient();
  const loginPassword = "E2ePass123!";
  try {
    const memberA = await prisma.user.upsert({
      where: { email: "e2e.membera@example.com" },
      create: { email: "e2e.membera@example.com", passwordHash: hashPassword(loginPassword), role: "MEMBER", memberStatus: "APPROVED", failedLoginAttempts: 0, loginLockedUntil: null },
      update: { role: "MEMBER", memberStatus: "APPROVED", passwordHash: hashPassword(loginPassword), failedLoginAttempts: 0, loginLockedUntil: null }
    });

    const memberB = await prisma.user.upsert({
      where: { email: "e2e.memberb@example.com" },
      create: { email: "e2e.memberb@example.com", passwordHash: hashPassword(loginPassword), role: "MEMBER", memberStatus: "APPROVED", failedLoginAttempts: 0, loginLockedUntil: null },
      update: { role: "MEMBER", memberStatus: "APPROVED", passwordHash: hashPassword(loginPassword), failedLoginAttempts: 0, loginLockedUntil: null }
    });

    const payer = await prisma.user.upsert({
      where: { email: "e2e.payer@example.com" },
      create: { email: "e2e.payer@example.com", passwordHash: hashPassword(loginPassword), role: "MEMBER", memberStatus: "APPROVED", failedLoginAttempts: 0, loginLockedUntil: null },
      update: { role: "MEMBER", memberStatus: "APPROVED", passwordHash: hashPassword(loginPassword), failedLoginAttempts: 0, loginLockedUntil: null }
    });

    const opsAdmin = await prisma.user.upsert({
      where: { email: "e2e.ops@example.com" },
      create: { email: "e2e.ops@example.com", passwordHash: hashPassword(loginPassword), role: "OPS_ADMIN", memberStatus: "APPROVED", failedLoginAttempts: 0, loginLockedUntil: null },
      update: { role: "OPS_ADMIN", memberStatus: "APPROVED", passwordHash: hashPassword(loginPassword), failedLoginAttempts: 0, loginLockedUntil: null }
    });

    const superAdmin = await prisma.user.upsert({
      where: { email: "e2e.super@example.com" },
      create: { email: "e2e.super@example.com", passwordHash: hashPassword(loginPassword), role: "SUPER_ADMIN", memberStatus: "APPROVED", failedLoginAttempts: 0, loginLockedUntil: null },
      update: { role: "SUPER_ADMIN", memberStatus: "APPROVED", passwordHash: hashPassword(loginPassword), failedLoginAttempts: 0, loginLockedUntil: null }
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
      where: { senderUserId: payer.id, status: { in: ACTIVE_MATCH_STATES } },
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

    const existingProofReady = await prisma.match.findFirst({
      where: { senderUserId: memberA.id, status: { in: ACTIVE_MATCH_STATES } },
      orderBy: { createdAt: "desc" }
    });

    let proofReadyMatch = existingProofReady;
    if (!proofReadyMatch) {
      const memberOffer = await prisma.contributionOffer.create({
        data: {
          ownerUserId: memberA.id,
          amountMinor: 7000,
          remainingAmountMinor: 7000,
          currency: "USD",
          status: "ACTIVE"
        }
      });

      const memberRequest = await prisma.recipientRequest.create({
        data: {
          ownerUserId: memberB.id,
          amountMinor: 7000,
          remainingAmountMinor: 7000,
          currency: "USD",
          status: "ACTIVE"
        }
      });

      proofReadyMatch = await prisma.match.create({
        data: {
          matchReference: `e2e_proof_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
          batchRunId: `e2e_proof_batch_${Date.now()}`,
          contributionOfferId: memberOffer.id,
          recipientRequestId: memberRequest.id,
          senderUserId: memberA.id,
          recipientUserId: memberB.id,
          amountMinor: 500,
          status: "AWAITING_PAYMENT"
        }
      });
    }

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
    const state: StatePayload = {
      memberAId: memberA.id,
      memberBId: memberB.id,
      opsAdminId: opsAdmin.id,
      superAdminId: superAdmin.id,
      disputeReadyMatchId: disputeReadyMatch.id,
      proofReadyMatchId: proofReadyMatch.id,
      memberEmail: "e2e.membera@example.com",
      opsEmail: "e2e.ops@example.com",
      superEmail: "e2e.super@example.com",
      loginPassword
    };

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;

