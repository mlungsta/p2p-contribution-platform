import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

test("demo reset and seed command works", async () => {
  execSync("npm run demo:refresh", { stdio: "pipe" });

  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { email: { in: ["demo.member1@example.com", "demo.member2@example.com", "demo.ops@example.com", "demo.super@example.com"] } },
      select: { email: true }
    });
    expect(users.length).toBe(4);
  } finally {
    await prisma.$disconnect();
  }
});
