import { z } from "zod";

export const AppRoleSchema = z.enum(["MEMBER", "SUPPORT", "OPS_ADMIN", "SUPER_ADMIN", "COMPLIANCE_REVIEWER"]);
export type AppRole = z.infer<typeof AppRoleSchema>;

export function redirectPathForRole(role: AppRole): "/dashboard" | "/admin" {
  if (role === "MEMBER") return "/dashboard";
  return "/admin";
}
