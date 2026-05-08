import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AppRole, hasPermission, isAdminRole, Permission } from "@/lib/permissions";
import { resolveAuthenticatedSessionFromSources } from "@/lib/session-auth";

export async function requireAuthenticatedSession(): Promise<{ actorUserId: string; actorRole: AppRole }> {
  try {
    const reqHeaders = await headers();
    const reqCookies = await cookies();
    return await resolveAuthenticatedSessionFromSources(reqHeaders, reqCookies, db);
  } catch {
    redirect("/auth");
  }
}

export async function requireAuthenticatedRole(): Promise<AppRole> {
  const session = await requireAuthenticatedSession();
  return session.actorRole;
}

export async function requireAdminRouteAccess(): Promise<AppRole> {
  const role = await requireAuthenticatedRole();
  if (!isAdminRole(role)) {
    redirect("/auth");
  }
  return role;
}

export async function requireMemberRouteAccess(): Promise<AppRole> {
  const role = await requireAuthenticatedRole();
  if (role !== "MEMBER") {
    redirect("/auth");
  }
  return role;
}

export async function requireRoutePermission(permission: Permission): Promise<AppRole> {
  const role = await requireAuthenticatedRole();
  if (!hasPermission(role, permission)) {
    redirect("/auth");
  }
  return role;
}
