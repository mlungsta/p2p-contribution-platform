import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Safe updates only if legacy enum values still exist in environment-specific DB states.
  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'ContributionOfferStatus' AND e.enumlabel = 'AWAITING_PAYMENT') THEN
    UPDATE contribution_offers SET status = 'MATCHED' WHERE status::text IN ('AWAITING_PAYMENT','PROOF_UPLOADED','CONFIRMED','DISPUTED','RESOLVED');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'DisputeStatus' AND e.enumlabel = 'REJECTED') THEN
    IF EXISTS (SELECT 1 FROM pg_type t2 JOIN pg_enum e2 ON t2.oid = e2.enumtypid WHERE t2.typname = 'DisputeStatus' AND e2.enumlabel = 'CLOSED') THEN
      UPDATE disputes SET status = 'CLOSED' WHERE status::text = 'REJECTED';
    ELSE
      UPDATE disputes SET status = 'RESOLVED' WHERE status::text = 'REJECTED';
    END IF;
  END IF;
END $$;
`);

  const legacyOfferCount = await prisma.$queryRawUnsafe(`
SELECT COUNT(*)::int AS count
FROM contribution_offers
WHERE status::text IN ('AWAITING_PAYMENT','PROOF_UPLOADED','CONFIRMED','DISPUTED','RESOLVED')
`);

  const legacyDisputeCount = await prisma.$queryRawUnsafe(`
SELECT COUNT(*)::int AS count
FROM disputes
WHERE status::text = 'REJECTED'
`);

  const offers = Array.isArray(legacyOfferCount) ? legacyOfferCount[0]?.count ?? 0 : 0;
  const disputes = Array.isArray(legacyDisputeCount) ? legacyDisputeCount[0]?.count ?? 0 : 0;

  if (offers > 0 || disputes > 0) {
    throw new Error(`Enum contraction precheck failed: legacy offers=${offers}, legacy disputes=${disputes}`);
  }

  console.log("Enum contraction precheck passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
