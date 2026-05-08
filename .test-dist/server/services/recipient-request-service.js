"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRecipientRequest = createRecipientRequest;
exports.activateRecipientRequest = activateRecipientRequest;
exports.getRecipientQueue = getRecipientQueue;
exports.expireRecipientRequests = expireRecipientRequests;
const zod_1 = require("zod");
const requestCreateSchema = zod_1.z.object({
    ownerUserId: zod_1.z.string().min(1),
    amountMinor: zod_1.z.number().int().positive(),
    currency: zod_1.z.string().min(3).max(10).default("USD"),
    expiresAt: zod_1.z.date().optional()
});
async function createRecipientRequest(prisma, input) {
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
async function activateRecipientRequest(prisma, requestId) {
    return prisma.recipientRequest.update({
        where: { id: requestId },
        data: { status: "ACTIVE" }
    });
}
async function getRecipientQueue(prisma) {
    return prisma.recipientRequest.findMany({
        where: { status: { in: ["ACTIVE", "WAITING_FOR_POOL", "PARTIALLY_MATCHED"] } },
        orderBy: { createdAt: "asc" }
    });
}
async function expireRecipientRequests(prisma, now) {
    const result = await prisma.recipientRequest.updateMany({
        where: {
            status: { in: ["ACTIVE", "WAITING_FOR_POOL", "PARTIALLY_MATCHED"] },
            expiresAt: { lte: now }
        },
        data: { status: "EXPIRED" }
    });
    return result.count;
}
