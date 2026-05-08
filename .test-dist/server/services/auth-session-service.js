"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthSessionService = exports.AuthServiceError = void 0;
const auth_provider_1 = require("../../lib/auth-provider");
const audit_1 = require("../../lib/audit");
class AuthServiceError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.AuthServiceError = AuthServiceError;
class AuthSessionService {
    prisma;
    audit;
    constructor(prisma) {
        this.prisma = prisma;
        this.audit = (0, audit_1.createAuditService)(new PrismaAuditRepository(prisma));
    }
    async loginWithCredentials(email, password) {
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, passwordHash: true, memberStatus: true, failedLoginAttempts: true, loginLockedUntil: true }
        });
        if (!user || !user.passwordHash || !(0, auth_provider_1.verifyPassword)(password, user.passwordHash)) {
            if (user) {
                await this.recordFailedLoginAttempt(user.id);
            }
            throw new AuthServiceError("UNAUTHORIZED", "Invalid credentials");
        }
        if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
            throw new AuthServiceError("FORBIDDEN", "Account temporarily locked due to failed login attempts");
        }
        if (!["APPROVED", "PENDING_REVIEW"].includes(user.memberStatus)) {
            throw new AuthServiceError("FORBIDDEN", "Account status does not allow login");
        }
        const session = (0, auth_provider_1.createSessionToken)(user.id);
        await this.prisma.$transaction(async (tx) => {
            await tx.authSession.create({
                data: {
                    userId: user.id,
                    jti: session.payload.jti,
                    expiresAt: new Date(session.payload.exp * 1000)
                }
            });
            await tx.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: 0, loginLockedUntil: null }
            });
        });
        return {
            userId: user.id,
            token: session.token,
            jti: session.payload.jti
        };
    }
    async resolveIdentityFromToken(token) {
        const verified = (0, auth_provider_1.verifySessionToken)(token);
        if (!verified) {
            return null;
        }
        const authSession = await this.prisma.authSession.findUnique({
            where: { jti: verified.jti },
            select: { userId: true, revokedAt: true, expiresAt: true }
        });
        if (!authSession || authSession.revokedAt || authSession.expiresAt <= new Date()) {
            return null;
        }
        const user = await this.prisma.user.findUnique({ where: { id: authSession.userId }, select: { id: true, role: true } });
        if (!user) {
            return null;
        }
        return {
            actorUserId: user.id,
            actorRole: user.role
        };
    }
    async revokeSessionByToken(token, reason) {
        const verified = (0, auth_provider_1.verifySessionToken)(token);
        if (!verified)
            return;
        await this.prisma.authSession.updateMany({
            where: { jti: verified.jti, revokedAt: null },
            data: { revokedAt: new Date(), revokeReason: reason }
        });
    }
    async revokeAllUserSessions(params) {
        if (params.actorRole !== "SUPER_ADMIN") {
            throw new AuthServiceError("FORBIDDEN", "Only SUPER_ADMIN can force logout sessions");
        }
        if (!params.reason || params.reason.trim().length < 3) {
            throw new AuthServiceError("FORBIDDEN", "Force logout reason is required");
        }
        const result = await this.prisma.authSession.updateMany({
            where: {
                userId: params.targetUserId,
                revokedAt: null,
                expiresAt: { gt: new Date() }
            },
            data: {
                revokedAt: new Date(),
                revokeReason: params.reason
            }
        });
        await this.audit.log({
            actorUserId: params.actorUserId,
            actorRole: params.actorRole,
            triggerSource: params.triggerSource,
            correlationId: params.correlationId,
            action: "auth.sessions.revoked",
            entityType: "USER",
            entityId: params.targetUserId,
            reason: params.reason,
            afterState: { revokedSessionCount: result.count }
        });
        return result.count;
    }
    async recordFailedLoginAttempt(userId) {
        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: { failedLoginAttempts: { increment: 1 } },
            select: { failedLoginAttempts: true }
        });
        if (updated.failedLoginAttempts >= 5) {
            const lockedUntil = new Date(Date.now() + 15 * 60_000);
            await this.prisma.user.update({
                where: { id: userId },
                data: { loginLockedUntil: lockedUntil }
            });
            await this.audit.log({
                actorUserId: userId,
                actorRole: "MEMBER",
                triggerSource: "api:auth:login",
                correlationId: `lockout:${userId}:${Date.now()}`,
                action: "auth.login.lockout",
                entityType: "USER",
                entityId: userId,
                afterState: { loginLockedUntil: lockedUntil.toISOString() }
            });
        }
    }
}
exports.AuthSessionService = AuthSessionService;
class PrismaAuditRepository {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(entry) {
        await this.prisma.auditLog.create({
            data: {
                actorUserId: entry.actorUserId,
                actorRole: entry.actorRole,
                triggerSource: entry.triggerSource,
                correlationId: entry.correlationId,
                batchRunId: entry.batchRunId,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                beforeState: entry.beforeState ?? undefined,
                afterState: entry.afterState ?? undefined,
                reason: entry.reason,
                metadata: entry.metadata ?? undefined,
                dedupeKey: entry.dedupeKey,
                occurredAt: entry.occurredAt
            }
        });
    }
}
