import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const thresholdCollisions = Number(process.env.MATCHING_COLLISION_THRESHOLD ?? "20");
const thresholdDeadlocks = Number(process.env.DB_DEADLOCK_THRESHOLD ?? "1");

async function main() {
  const collisionsRaw = await prisma.$queryRawUnsafe(`
SELECT COUNT(*)::int AS count
FROM audit_logs
WHERE action = 'matching.idempotency.collision'
  AND occurred_at >= NOW() - INTERVAL '1 hour'
`);

  const deadlocksRaw = await prisma.$queryRawUnsafe(`
SELECT COALESCE(SUM(deadlocks), 0)::int AS count
FROM pg_stat_database
WHERE datname = current_database()
`);

  const collisions = Array.isArray(collisionsRaw) ? (collisionsRaw[0]?.count ?? 0) : 0;
  const deadlocks = Array.isArray(deadlocksRaw) ? (deadlocksRaw[0]?.count ?? 0) : 0;

  if (collisions > thresholdCollisions) {
    throw new Error(`ALERT: idempotency collisions ${collisions} > ${thresholdCollisions}`);
  }

  if (deadlocks >= thresholdDeadlocks) {
    throw new Error(`ALERT: deadlocks ${deadlocks} >= ${thresholdDeadlocks}`);
  }

  // Trigger immutability violations surface as SQLSTATE/P2010 in app logs;
  // we guard by asserting no illegal updates/deletes can succeed in schema tests.
  console.log(`Alerts check passed: collisions=${collisions}, deadlocks=${deadlocks}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
