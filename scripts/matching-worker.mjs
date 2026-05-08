import { PrismaClient } from "@prisma/client";
import { runBatchMatchingInTransaction } from "../.test-dist/lib/matching.js";
import { createAuditService } from "../.test-dist/lib/audit.js";

class NoopAuditRepository {
  async create(_entry) {}
}

const [batchRunId, idempotencyKey, actorUserId, correlationId] = process.argv.slice(2);

const prisma = new PrismaClient();

async function main() {
  const result = await runBatchMatchingInTransaction({
    prisma,
    batchRunId,
    idempotencyKey,
    actor: {
      actorUserId,
      actorRole: "SUPER_ADMIN",
      triggerSource: "stress-test",
      correlationId
    },
    now: new Date(),
    auditLogger: createAuditService(new NoopAuditRepository())
  });

  process.stdout.write(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
