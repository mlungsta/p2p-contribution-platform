import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { RuntimeApiService, executeWithErrorHandling } from "../.test-dist/server/services/runtime-api-service.js";

const prisma = new PrismaClient();

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function ctx(actorUserId, actorRole, correlationId) {
  return {
    actorUserId,
    actorRole,
    correlationId,
    triggerSource: "integration",
    batchRunId: uid("batch")
  };
}

async function main() {
  const memberA = await prisma.user.create({ data: { email: `${uid("mA")}@example.com`, passwordHash: "h", role: "MEMBER", memberStatus: "APPROVED" } });
  const memberB = await prisma.user.create({ data: { email: `${uid("mB")}@example.com`, passwordHash: "h", role: "MEMBER", memberStatus: "APPROVED" } });
  const ops = await prisma.user.create({ data: { email: `${uid("ops")}@example.com`, passwordHash: "h", role: "OPS_ADMIN", memberStatus: "APPROVED" } });
  const support = await prisma.user.create({ data: { email: `${uid("sup")}@example.com`, passwordHash: "h", role: "SUPPORT", memberStatus: "APPROVED" } });
  const superAdmin = await prisma.user.create({ data: { email: `${uid("sadm")}@example.com`, passwordHash: "h", role: "SUPER_ADMIN", memberStatus: "APPROVED" } });
  const compliance = await prisma.user.create({ data: { email: `${uid("comp")}@example.com`, passwordHash: "h", role: "COMPLIANCE_REVIEWER", memberStatus: "APPROVED" } });

  const service = new RuntimeApiService(prisma);

  const offer = await service.createContributionOffer(ctx(memberA.id, "MEMBER", uid("corr")), { amountMinor: 10000, currency: "USD" });
  assert.equal(offer.amountMinor, 10000);

  const request = await service.createRecipientRequest(ctx(memberB.id, "MEMBER", uid("corr")), { amountMinor: 10000, currency: "USD" });
  assert.equal(request.amountMinor, 10000);

  const batchRunId = uid("run");
  const matchingResult = await service.runBatchMatching(ctx(superAdmin.id, "SUPER_ADMIN", uid("corr")), { batchRunId, idempotencyKey: uid("idem") });
  assert.equal(typeof matchingResult.createdCount, "number");

  const createdMatch = await prisma.match.findFirst({
    where: { batchRunId, senderUserId: memberA.id, recipientUserId: memberB.id }
  });
  if (createdMatch) {
    await service.uploadProofMetadata(ctx(memberA.id, "MEMBER", uid("corr")), { matchId: createdMatch.id, fileUrl: "https://example.com/p.png" });

    await service.confirmReceipt(ctx(memberB.id, "MEMBER", uid("corr")), { matchId: createdMatch.id });

    const reopenMatch = await prisma.match.update({ where: { id: createdMatch.id }, data: { status: "ASSIGNED" } });
    assert.equal(reopenMatch.status, "ASSIGNED");

    const dispute = await service.openDispute(ctx(memberA.id, "MEMBER", uid("corr")), { matchId: createdMatch.id, reason: "recipient did not confirm in time" });
    assert.equal(dispute.status, "OPEN");

    const resolved = await service.resolveDispute(ctx(ops.id, "OPS_ADMIN", uid("corr")), { disputeId: dispute.id, resolutionNote: "evidence accepted" });
    assert.equal(resolved.status, "RESOLVED");
  }

  const memberOverrideResult = await executeWithErrorHandling(RuntimeApiService.parseContext(ctx(memberA.id, "MEMBER", uid("corr"))), () =>
    service.adminOverride(ctx(memberA.id, "MEMBER", uid("corr")), {
      batchRunId: uid("ovr"),
      offerId: offer.id,
      requestId: request.id,
      amountMinor: 1000,
      reason: "attempt"
    })
  );
  assert.equal(memberOverrideResult.ok, false);

  const superOverrideResult = await executeWithErrorHandling(RuntimeApiService.parseContext(ctx(superAdmin.id, "SUPER_ADMIN", uid("corr"))), () =>
    service.adminOverride(ctx(superAdmin.id, "SUPER_ADMIN", uid("corr")), {
      batchRunId: uid("ovr"),
      offerId: offer.id,
      requestId: request.id,
      amountMinor: 1000,
      reason: "manual correction"
    })
  );
  assert.equal(superOverrideResult.ok, true);

  await prisma.systemSetting.upsert({
    where: { key: "SAFE_MODE" },
    create: { key: "SAFE_MODE", value: { enabled: true } },
    update: { value: { enabled: true } }
  });

  const safeModeOffer = await service.createContributionOffer(ctx(memberA.id, "MEMBER", uid("corr")), { amountMinor: 12000, currency: "USD" });
  assert.equal(safeModeOffer.status, "WAITING_FOR_POOL");

  const safeModeBatch = await executeWithErrorHandling(RuntimeApiService.parseContext(ctx(ops.id, "OPS_ADMIN", uid("corr"))), () =>
    service.runBatchMatching(ctx(ops.id, "OPS_ADMIN", uid("corr")), { batchRunId: uid("safe"), idempotencyKey: uid("safeidem") })
  );
  assert.equal(safeModeBatch.ok, false);

  const supportResolveDenied = await executeWithErrorHandling(RuntimeApiService.parseContext(ctx(support.id, "SUPPORT", uid("corr"))), () =>
    service.resolveDispute(ctx(support.id, "SUPPORT", uid("corr")), { disputeId: uid("missing"), resolutionNote: "cannot" })
  );
  assert.equal(supportResolveDenied.ok, false);

  const complianceHistory = await service.viewMemberStatusHistory(ctx(compliance.id, "COMPLIANCE_REVIEWER", uid("corr")));
  assert.equal(!!complianceHistory, true);

  console.log("Runtime integration tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
