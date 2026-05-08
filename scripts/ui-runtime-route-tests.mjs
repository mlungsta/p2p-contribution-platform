import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { RuntimeApiService, executeWithErrorHandling } from "../.test-dist/server/services/runtime-api-service.js";

const prisma = new PrismaClient();

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function ctx(actorUserId, actorRole, correlationId = uid("corr")) {
  return { actorUserId, actorRole, correlationId, triggerSource: "ui-integration" };
}

async function main() {
  const memberA = await prisma.user.create({ data: { email: `${uid("mA")}@example.com`, passwordHash: "h", role: "MEMBER", memberStatus: "APPROVED" } });
  const memberB = await prisma.user.create({ data: { email: `${uid("mB")}@example.com`, passwordHash: "h", role: "MEMBER", memberStatus: "APPROVED" } });
  const ops = await prisma.user.create({ data: { email: `${uid("ops")}@example.com`, passwordHash: "h", role: "OPS_ADMIN", memberStatus: "APPROVED" } });
  const superAdmin = await prisma.user.create({ data: { email: `${uid("sa")}@example.com`, passwordHash: "h", role: "SUPER_ADMIN", memberStatus: "APPROVED" } });

  const service = new RuntimeApiService(prisma);
  await prisma.systemSetting.upsert({ where: { key: "SAFE_MODE" }, create: { key: "SAFE_MODE", value: { enabled: false } }, update: { value: { enabled: false } } });

  const offer = await service.createContributionOffer(ctx(memberA.id, "MEMBER"), { amountMinor: 10000, currency: "USD" });
  assert.equal(offer.amountMinor, 10000);

  const request = await service.createRecipientRequest(ctx(memberB.id, "MEMBER"), { amountMinor: 9000, currency: "USD" });
  assert.equal(request.amountMinor, 9000);

  const memberBlocked = await executeWithErrorHandling(ctx(memberA.id, "MEMBER"), () =>
    service.runBatchMatching(ctx(memberA.id, "MEMBER"), { batchRunId: uid("member_block_batch"), idempotencyKey: uid("member_block_idem") })
  );
  assert.equal(memberBlocked.ok, false);
  assert.equal(memberBlocked.error.code, "FORBIDDEN");

  const adminBatch = await executeWithErrorHandling(ctx(ops.id, "OPS_ADMIN"), () =>
    service.runBatchMatching(ctx(ops.id, "OPS_ADMIN"), { batchRunId: uid("admin_batch"), idempotencyKey: uid("admin_idem") })
  );
  assert.equal(adminBatch.ok, true);

  const noReasonOverride = await executeWithErrorHandling(ctx(superAdmin.id, "SUPER_ADMIN"), () =>
    service.adminOverride(ctx(superAdmin.id, "SUPER_ADMIN"), {
      batchRunId: uid("ovr"),
      offerId: offer.id,
      requestId: request.id,
      amountMinor: 500,
      reason: "no"
    })
  );
  assert.equal(noReasonOverride.ok, false);
  assert.equal(noReasonOverride.error.code, "VALIDATION_ERROR");

  await prisma.systemSetting.upsert({ where: { key: "SAFE_MODE" }, create: { key: "SAFE_MODE", value: { enabled: true } }, update: { value: { enabled: true } } });
  const safeModeBlocked = await executeWithErrorHandling(ctx(ops.id, "OPS_ADMIN"), () =>
    service.runBatchMatching(ctx(ops.id, "OPS_ADMIN"), { batchRunId: uid("admin_batch"), idempotencyKey: uid("admin_idem") })
  );
  assert.equal(safeModeBlocked.ok, false);
  assert.equal(safeModeBlocked.error.code, "SAFE_MODE_BLOCKED");

  const badAmount = await executeWithErrorHandling(ctx(memberA.id, "MEMBER", "corr-ui-safe"), () =>
    service.createContributionOffer(ctx(memberA.id, "MEMBER", "corr-ui-safe"), { amountMinor: 10.5, currency: "USD" })
  );
  assert.equal(badAmount.ok, false);
  assert.equal(badAmount.error.correlationId, "corr-ui-safe");
  assert.equal(typeof badAmount.error.message, "string");
  assert.equal(badAmount.error.message.includes("Unexpected internal error"), false);

  await prisma.systemSetting.upsert({ where: { key: "SAFE_MODE" }, create: { key: "SAFE_MODE", value: { enabled: false } }, update: { value: { enabled: false } } });

  console.log("UI runtime integration tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

