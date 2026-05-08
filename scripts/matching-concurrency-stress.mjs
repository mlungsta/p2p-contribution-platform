import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const prisma = new PrismaClient();

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function runWorker(batchRunId, idempotencyKey, actorUserId, correlationId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/matching-worker.mjs", batchRunId, idempotencyKey, actorUserId, correlationId], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let out = "";
    let err = "";

    child.stdout.on("data", (d) => {
      out += d.toString();
    });

    child.stderr.on("data", (d) => {
      err += d.toString();
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(err || `worker exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(out || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function main() {
  const payer = await prisma.user.create({
    data: {
      email: `${uid("stress_payer")}@example.com`,
      passwordHash: "h",
      role: "MEMBER",
      memberStatus: "APPROVED"
    }
  });

  const recipient = await prisma.user.create({
    data: {
      email: `${uid("stress_recipient")}@example.com`,
      passwordHash: "h",
      role: "MEMBER",
      memberStatus: "APPROVED"
    }
  });

  await prisma.contributionOffer.create({
    data: {
      ownerUserId: payer.id,
      amountMinor: 10000,
      remainingAmountMinor: 10000,
      status: "ACTIVE"
    }
  });

  await prisma.recipientRequest.create({
    data: {
      ownerUserId: recipient.id,
      amountMinor: 10000,
      remainingAmountMinor: 10000,
      status: "ACTIVE"
    }
  });

  const batchRunId = uid("stress_batch");
  const idempotencyKey = uid("stress_idem");

  const workers = await Promise.all([
    runWorker(batchRunId, idempotencyKey, payer.id, uid("corr")),
    runWorker(batchRunId, idempotencyKey, payer.id, uid("corr"))
  ]);

  const createdSum = workers.reduce((sum, r) => sum + (r.createdCount ?? 0), 0);

  const dbCount = await prisma.match.count({
    where: {
      batchRunId,
      contributionOfferId: (await prisma.contributionOffer.findFirstOrThrow({ where: { ownerUserId: payer.id }, orderBy: { createdAt: "desc" } })).id,
      recipientRequestId: (await prisma.recipientRequest.findFirstOrThrow({ where: { ownerUserId: recipient.id }, orderBy: { createdAt: "desc" } })).id
    }
  });
  assert.equal(dbCount <= 1, true);
  assert.equal(createdSum >= 0, true);

  console.log("Matching concurrency stress test passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
