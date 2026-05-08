import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server.js";
import { resolveAuthenticatedSession, getCorrelationId } from "../.test-dist/lib/session-auth.js";
import { hashPassword } from "../.test-dist/lib/auth-provider.js";
import { AuthServiceError, AuthSessionService } from "../.test-dist/server/services/auth-session-service.js";
import { requireAdminRoute, requireSuperAdminRoute } from "../.test-dist/lib/route-auth.js";
import { isSessionBootstrapAllowed } from "../.test-dist/lib/session-bootstrap-policy.js";
import { requireStepUpForSensitiveAction } from "../.test-dist/lib/step-up-policy.js";

const prisma = new PrismaClient();

function reqWithHeaders(headersObj) {
  const map = new Map(Object.entries(headersObj));
  return {
    headers: {
      get: (k) => map.get(k) ?? map.get(k.toLowerCase()) ?? null
    },
    cookies: {
      get: () => undefined
    }
  };
}

async function main() {
  const now = Date.now();
  const superUser = await prisma.user.create({
    data: {
      email: `auth_super_${now}_${Math.floor(Math.random() * 100000)}@example.com`,
      passwordHash: hashPassword("StrongPass!123"),
      role: "SUPER_ADMIN",
      memberStatus: "APPROVED"
    }
  });

  const memberUser = await prisma.user.create({
    data: {
      email: `auth_member_${now}_${Math.floor(Math.random() * 100000)}@example.com`,
      passwordHash: hashPassword("StrongPass!123"),
      role: "MEMBER",
      memberStatus: "APPROVED"
    }
  });

  const authService = new AuthSessionService(prisma);

  const oldNodeEnv = process.env.NODE_ENV;
  const oldTestHelper = process.env.ENABLE_TEST_AUTH_HELPER;

  process.env.NODE_ENV = "production";
  process.env.ENABLE_TEST_AUTH_HELPER = "false";

  // unauthenticated access denied
  await assert.rejects(() => resolveAuthenticatedSession(reqWithHeaders({}), prisma));

  // bootstrap denied in production
  assert.equal(isSessionBootstrapAllowed({ NODE_ENV: "production" }), false);

  // test-only helper disabled outside test mode
  await assert.rejects(() =>
    resolveAuthenticatedSession(
      reqWithHeaders({
        "x-test-user-id": superUser.id,
        "x-test-user-role": "SUPER_ADMIN"
      }),
      prisma
    )
  );

  process.env.NODE_ENV = oldNodeEnv;
  process.env.ENABLE_TEST_AUTH_HELPER = oldTestHelper;

  // login/session success
  const superLogin = await authService.loginWithCredentials(superUser.email, "StrongPass!123");
  const superSession = await resolveAuthenticatedSession(
    reqWithHeaders({
      authorization: `Bearer ${superLogin.token}`,
      "x-user-role": "MEMBER"
    }),
    prisma
  );
  assert.equal(superSession.actorUserId, superUser.id);
  assert.equal(superSession.actorRole, "SUPER_ADMIN");

  // role spoofing fails (DB role wins)
  assert.equal(superSession.actorRole, "SUPER_ADMIN");

  // logout revokes token/session
  await authService.revokeSessionByToken(superLogin.token, "user_logout");
  await assert.rejects(() => resolveAuthenticatedSession(reqWithHeaders({ authorization: `Bearer ${superLogin.token}` }), prisma));

  // revoked session denied
  const tempLogin = await authService.loginWithCredentials(memberUser.email, "StrongPass!123");
  await authService.revokeSessionByToken(tempLogin.token, "manual_revoke");
  await assert.rejects(() => resolveAuthenticatedSession(reqWithHeaders({ authorization: `Bearer ${tempLogin.token}` }), prisma));

  // forced logout revokes all user sessions
  const loginA = await authService.loginWithCredentials(memberUser.email, "StrongPass!123");
  const loginB = await authService.loginWithCredentials(memberUser.email, "StrongPass!123");
  const revokedCount = await authService.revokeAllUserSessions({
    actorUserId: superUser.id,
    actorRole: "SUPER_ADMIN",
    targetUserId: memberUser.id,
    reason: "security incident",
    correlationId: `corr-${Date.now()}`,
    triggerSource: "test"
  });
  assert.equal(revokedCount >= 2, true);
  await assert.rejects(() => resolveAuthenticatedSession(reqWithHeaders({ authorization: `Bearer ${loginA.token}` }), prisma));
  await assert.rejects(() => resolveAuthenticatedSession(reqWithHeaders({ authorization: `Bearer ${loginB.token}` }), prisma));

  // forced logout requires SUPER_ADMIN + reason
  await assert.rejects(
    () => authService.revokeAllUserSessions({
      actorUserId: memberUser.id,
      actorRole: "MEMBER",
      targetUserId: superUser.id,
      reason: "no",
      correlationId: `corr-${Date.now()}`,
      triggerSource: "test"
    }),
    (err) => err instanceof AuthServiceError && err.code === "FORBIDDEN"
  );

  await assert.rejects(
    () => authService.revokeAllUserSessions({
      actorUserId: superUser.id,
      actorRole: "SUPER_ADMIN",
      targetUserId: memberUser.id,
      reason: "",
      correlationId: `corr-${Date.now()}`,
      triggerSource: "test"
    }),
    (err) => err instanceof AuthServiceError && err.code === "FORBIDDEN"
  );

  // failed login attempts trigger lockout/delay
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => authService.loginWithCredentials(memberUser.email, "WrongPass!999"));
  }

  const lockedUser = await prisma.user.findUnique({ where: { id: memberUser.id }, select: { loginLockedUntil: true } });
  assert.equal(Boolean(lockedUser?.loginLockedUntil), true);

  // locked account cannot login
  await assert.rejects(
    () => authService.loginWithCredentials(memberUser.email, "StrongPass!123"),
    (err) => err instanceof AuthServiceError && err.code === "FORBIDDEN"
  );

  // audit logs created for forced logout and lockout
  const lockoutAudit = await prisma.auditLog.findFirst({ where: { action: "auth.login.lockout", entityId: memberUser.id } });
  assert.equal(Boolean(lockoutAudit), true);
  const revokeAudit = await prisma.auditLog.findFirst({ where: { action: "auth.sessions.revoked", entityId: memberUser.id, reason: "security incident" } });
  assert.equal(Boolean(revokeAudit), true);

  // sensitive admin action checks step-up policy
  assert.throws(() => requireStepUpForSensitiveAction(new NextRequest("http://localhost/api/admin/overrides", { method: "POST" })));
  assert.doesNotThrow(() => requireStepUpForSensitiveAction(new NextRequest("http://localhost/api/admin/overrides", { method: "POST", headers: { "x-step-up-authenticated": "true" } })));

  // member blocked from admin + super admin allowed
  assert.throws(() => requireAdminRoute(memberUser.role));
  assert.doesNotThrow(() => requireSuperAdminRoute(superUser.role));

  // correlation id generated if missing
  const corr = getCorrelationId(reqWithHeaders({}));
  assert.equal(typeof corr, "string");
  assert.equal(corr.length > 10, true);

  console.log("Auth boundary tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
