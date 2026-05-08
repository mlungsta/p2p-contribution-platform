import test from "node:test";
import assert from "node:assert/strict";
import { getRolePermissions, hasPermission, isAdminRole, requirePermission, roles } from "../lib/permissions";

test("defines all required roles", () => {
  assert.deepEqual(roles, ["MEMBER", "SUPPORT", "OPS_ADMIN", "SUPER_ADMIN", "COMPLIANCE_REVIEWER"]);
});

test("grants expected admin/compliance access", () => {
  assert.equal(hasPermission("SUPER_ADMIN", "audit:view"), true);
  assert.equal(hasPermission("COMPLIANCE_REVIEWER", "audit:view"), true);
  assert.equal(hasPermission("MEMBER", "audit:view"), false);
});

test("enforces permission checks", () => {
  assert.throws(() => requirePermission("MEMBER", "rules:configure"), /Forbidden/);
  assert.doesNotThrow(() => requirePermission("SUPER_ADMIN", "rules:configure"));
});

test("identifies admin route roles", () => {
  assert.equal(isAdminRole("OPS_ADMIN"), true);
  assert.equal(isAdminRole("COMPLIANCE_REVIEWER"), true);
  assert.equal(isAdminRole("MEMBER"), false);
});

test("returns role permissions map entries", () => {
  assert.equal(getRolePermissions("SUPPORT").includes("ticket:respond"), true);
});
