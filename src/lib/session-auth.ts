import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { appRoleSchema, AppRole } from "./permissions";
import { getSessionTokenFromRequest } from "./auth-provider";
import { AuthSessionService } from "../server/services/auth-session-service";

export interface AuthenticatedSession {
  actorUserId: string;
  actorRole: AppRole;
}

export class AuthBoundaryError extends Error {
  constructor(public readonly code: "UNAUTHORIZED" | "FORBIDDEN", message: string) {
    super(message);
  }
}

type HeaderReader = { get(name: string): string | null };
type CookieReader = { get(name: string): { value: string } | undefined };

function parseTestSessionFromHeaders(headers: HeaderReader): AuthenticatedSession | null {
  const enabled = process.env.NODE_ENV === "test" || process.env.ENABLE_TEST_AUTH_HELPER === "true";
  if (!enabled) {
    return null;
  }

  const actorUserId = headers.get("x-test-user-id");
  const actorRoleRaw = headers.get("x-test-user-role");
  if (!actorUserId || !actorRoleRaw) {
    return null;
  }

  const actorRole = appRoleSchema.parse(actorRoleRaw);
  return { actorUserId, actorRole };
}

async function parseBearerOrCookieSession(
  headers: HeaderReader,
  cookies: CookieReader | null,
  prisma: PrismaClient
): Promise<AuthenticatedSession | null> {
  const rawToken = getSessionTokenFromRequest(headers, cookies);
  const service = new AuthSessionService(prisma);
  return service.resolveIdentityFromToken(rawToken);
}

export async function resolveAuthenticatedSessionFromSources(
  headers: HeaderReader,
  cookies: CookieReader | null,
  prisma: PrismaClient
): Promise<AuthenticatedSession> {
  const testSession = parseTestSessionFromHeaders(headers);
  if (testSession) {
    return testSession;
  }

  const session = await parseBearerOrCookieSession(headers, cookies, prisma);
  if (session) {
    return session;
  }

  throw new AuthBoundaryError("UNAUTHORIZED", "Authentication required");
}

export async function resolveAuthenticatedSession(req: NextRequest, prisma: PrismaClient): Promise<AuthenticatedSession> {
  return resolveAuthenticatedSessionFromSources(req.headers, req.cookies, prisma);
}

export function getCorrelationId(req: NextRequest): string {
  return req.headers.get("x-correlation-id") ?? randomUUID();
}
