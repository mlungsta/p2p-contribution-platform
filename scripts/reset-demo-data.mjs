import { withDemoPrisma, resetDemoData } from "./demo-data-utils.mjs";

withDemoPrisma(async (prisma) => {
  const result = await resetDemoData(prisma);
  console.log(`Demo reset completed. deleted_users=${result.deletedUsers}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
