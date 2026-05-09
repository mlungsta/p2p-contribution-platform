import { withDemoPrisma, seedDemoData } from "./demo-data-utils.mjs";

withDemoPrisma(async (prisma) => {
  const seeded = await seedDemoData(prisma);
  console.log("Demo seed completed for local/staging usage.");
  console.log(`member=${seeded.users.memberA}, member2=${seeded.users.memberB}, ops=${seeded.users.opsAdmin}, super=${seeded.users.superAdmin}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
