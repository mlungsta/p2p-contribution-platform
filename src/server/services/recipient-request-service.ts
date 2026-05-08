import { z } from "zod";

interface RecipientRequestPrismaLike {
  recipientRequest: {
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
}

const requestCreateSchema = z.object({
  ownerUserId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().min(3).max(10).default("USD"),
  expiresAt: z.date().optional()
});

export async function createRecipientRequest(prisma: RecipientRequestPrismaLike, input: z.input<typeof requestCreateSchema>) {
  const parsed = requestCreateSchema.parse(input);
  return prisma.recipientRequest.create({
    data: {
      ownerUserId: parsed.ownerUserId,
      amountMinor: parsed.amountMinor,
      remainingAmountMinor: parsed.amountMinor,
      currency: parsed.currency,
      status: "CREATED",
      expiresAt: parsed.expiresAt
    }
  });
}

export async function activateRecipientRequest(prisma: RecipientRequestPrismaLike, requestId: string) {
  return prisma.recipientRequest.update({
    where: { id: requestId },
    data: { status: "ACTIVE" }
  });
}

export async function getRecipientQueue(prisma: RecipientRequestPrismaLike) {
  return prisma.recipientRequest.findMany({
    where: { status: { in: ["ACTIVE", "WAITING_FOR_POOL", "PARTIALLY_MATCHED"] } },
    orderBy: { createdAt: "asc" }
  });
}

export async function expireRecipientRequests(prisma: RecipientRequestPrismaLike, now: Date): Promise<number> {
  const result = await prisma.recipientRequest.updateMany({
    where: {
      status: { in: ["ACTIVE", "WAITING_FOR_POOL", "PARTIALLY_MATCHED"] },
      expiresAt: { lte: now }
    },
    data: { status: "EXPIRED" }
  });

  return result.count;
}
