import { PrismaClient } from "@prisma/client";
import { AppRole } from "../../lib/permissions";
import { createSessionToken, verifyPassword, verifySessionToken } from "../../lib/auth-provider";
import { createAuditService, AuditLogger, AuditRepository } from "../../lib/audit";
import { Prisma } from "@prisma/client";

export class AuthServiceError extends Error {
  constructor(public readonly code: "UNAUTHORIZED" | "FORBIDDEN", message: string) {
    super(message);
  }
}

export interface LoginResult {
  userId: string;
  role: AppRole;
  token: string;
  jti: string;
}

export interface SessionIdentity {
  actorUserId: string;
  actorRole: AppRole;
}

export class AuthSessionService {
  private readonly audit: AuditLogger;

  constructor(private readonly prisma: PrismaClient) {
    this.audit = createAuditService(new PrismaAuditRepository(prisma));
  }

  async loginWithCredentials(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, passwordHash: true, memberStatus: true, failedLoginAttempts: true, loginLockedUntil: true }
    });

    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      if (user) {
        await this.recordFailedLoginAttempt(user.id);
      }
      throw new AuthServiceError("UNAUTHORIZED", "Invalid email or password.");
    }

    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      throw new AuthServiceError("FORBIDDEN", "Account temporarily locked due to failed login attempts");
    }

    if (!["APPROVED", "PENDING_REVIEW"].includes(user.memberStatus)) {
      throw new AuthServiceError("FORBIDDEN", "Account status does not allow login");
    }

    const session = createSessionToken(user.id);
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
      role: user.role,
      token: session.token,
      jti: session.payload.jti
    };
  }

  async resolveIdentityFromToken(token: string | null | undefined): Promise<SessionIdentity | null> {
    const verified = verifySessionToken(token);
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

  async revokeSessionByToken(token: string | null | undefined, reason: string): Promise<void> {
    const verified = verifySessionToken(token);
    if (!verified) return;

    await this.prisma.authSession.updateMany({
      where: { jti: verified.jti, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason }
    });
  }

  async revokeAllUserSessions(params: {
    actorUserId: string;
    actorRole: AppRole;
    targetUserId: string;
    reason: string;
    correlationId: string;
    triggerSource: string;
  }): Promise<number> {
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

  private async recordFailedLoginAttempt(userId: string): Promise<void> {
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

class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(entry: Parameters<AuditLogger["log"]>[0]): Promise<void> {
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
        beforeState: (entry.beforeState as Prisma.JsonObject | undefined) ?? undefined,
        afterState: (entry.afterState as Prisma.JsonObject | undefined) ?? undefined,
        reason: entry.reason,
        metadata: (entry.metadata as Prisma.JsonObject | undefined) ?? undefined,
        dedupeKey: entry.dedupeKey,
        occurredAt: entry.occurredAt
      }
    });
  }
}
