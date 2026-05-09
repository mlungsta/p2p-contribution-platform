import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const DEMO_EMAILS = [
  "demo.member1@example.com",
  "demo.member2@example.com",
  "demo.ops@example.com",
  "demo.super@example.com"
];

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `s2:${salt}:${derived}`;
}

export function guardNonProduction() {
  const appEnv = process.env.APP_ENV ?? "development";
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (nodeEnv === "production" || appEnv === "production") {
    throw new Error("demo data operations are blocked in production");
  }

  if (!["development", "test", "staging"].includes(appEnv)) {
    throw new Error(`demo data operations require APP_ENV in development|test|staging. Received: ${appEnv}`);
  }
}

async function getDemoUsers(prisma) {
  return prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { id: true, email: true }
  });
}

export async function resetDemoData(prisma) {
  guardNonProduction();

  const users = await getDemoUsers(prisma);
  const userIds = users.map((u) => u.id);

  await prisma.$transaction(async (tx) => {
    if (userIds.length > 0) {
      await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.updateMany({
        where: { id: { in: userIds } },
        data: { failedLoginAttempts: 0, loginLockedUntil: null }
      });

      await tx.contributionOffer.deleteMany({
        where: {
          ownerUserId: { in: userIds },
          matches: { none: {} }
        }
      });

      await tx.recipientRequest.deleteMany({
        where: {
          ownerUserId: { in: userIds },
          matches: { none: {} }
        }
      });
    }

    await tx.systemSetting.upsert({
      where: { key: "SAFE_MODE" },
      create: { key: "SAFE_MODE", value: { enabled: false } },
      update: { value: { enabled: false } }
    });
  });

  return { affectedUsers: userIds.length };
}

async function upsertUser(prisma, { email, role, memberStatus, displayName, password }) {
  const passwordHash = hashPassword(password);
  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role,
      memberStatus,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      memberProfile: {
        create: {
          displayName,
          countryCode: "ZA",
          timezone: "Africa/Johannesburg"
        }
      }
    },
    update: {
      role,
      memberStatus,
      passwordHash,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
      memberProfile: {
        upsert: {
          create: { displayName, countryCode: "ZA", timezone: "Africa/Johannesburg" },
          update: { displayName, countryCode: "ZA", timezone: "Africa/Johannesburg" }
        }
      }
    }
  });
}

export async function seedDemoData(prisma) {
  guardNonProduction();
  await resetDemoData(prisma);

  const memberA = await upsertUser(prisma, {
    email: "demo.member1@example.com",
    role: "MEMBER",
    memberStatus: "APPROVED",
    displayName: "Demo Member One",
    password: "DemoPass123!"
  });

  const memberB = await upsertUser(prisma, {
    email: "demo.member2@example.com",
    role: "MEMBER",
    memberStatus: "APPROVED",
    displayName: "Demo Member Two",
    password: "DemoPass123!"
  });

  const opsAdmin = await upsertUser(prisma, {
    email: "demo.ops@example.com",
    role: "OPS_ADMIN",
    memberStatus: "APPROVED",
    displayName: "Demo Ops Admin",
    password: "DemoPass123!"
  });

  const superAdmin = await upsertUser(prisma, {
    email: "demo.super@example.com",
    role: "SUPER_ADMIN",
    memberStatus: "APPROVED",
    displayName: "Demo Super Admin",
    password: "DemoPass123!"
  });

  const existingActiveMatch = await prisma.match.findFirst({
    where: {
      senderUserId: memberA.id,
      status: { in: ["CREATED", "ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION", "DISPUTED"] }
    },
    orderBy: { createdAt: "desc" }
  });

  let demoMatch = existingActiveMatch;
  if (!demoMatch) {
    const offer = await prisma.contributionOffer.create({
      data: {
        ownerUserId: memberA.id,
        amountMinor: 25000,
        remainingAmountMinor: 19000,
        currency: "USD",
        status: "MATCHED"
      }
    });

    const request = await prisma.recipientRequest.create({
      data: {
        ownerUserId: memberB.id,
        amountMinor: 25000,
        remainingAmountMinor: 19000,
        currency: "USD",
        status: "PARTIALLY_MATCHED"
      }
    });

    demoMatch = await prisma.match.create({
      data: {
        matchReference: `demo_match_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
        batchRunId: `demo_batch_${Date.now()}`,
        contributionOfferId: offer.id,
        recipientRequestId: request.id,
        senderUserId: memberA.id,
        recipientUserId: memberB.id,
        amountMinor: 6000,
        status: "AWAITING_PAYMENT"
      }
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: "SAFE_MODE" },
    create: { key: "SAFE_MODE", value: { enabled: false } },
    update: { value: { enabled: false } }
  });

  return {
    users: {
      memberA: memberA.email,
      memberB: memberB.email,
      opsAdmin: opsAdmin.email,
      superAdmin: superAdmin.email
    },
    demoMatchId: demoMatch.id
  };
}

export async function withDemoPrisma(callback) {
  const prisma = new PrismaClient();
  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
