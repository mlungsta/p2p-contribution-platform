"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const permissions_1 = require("../lib/permissions");
(0, node_test_1.default)("defines all required roles", () => {
    strict_1.default.deepEqual(permissions_1.roles, ["MEMBER", "SUPPORT", "OPS_ADMIN", "SUPER_ADMIN", "COMPLIANCE_REVIEWER"]);
});
(0, node_test_1.default)("grants expected admin/compliance access", () => {
    strict_1.default.equal((0, permissions_1.hasPermission)("SUPER_ADMIN", "audit:view"), true);
    strict_1.default.equal((0, permissions_1.hasPermission)("COMPLIANCE_REVIEWER", "audit:view"), true);
    strict_1.default.equal((0, permissions_1.hasPermission)("MEMBER", "audit:view"), false);
});
(0, node_test_1.default)("enforces permission checks", () => {
    strict_1.default.throws(() => (0, permissions_1.requirePermission)("MEMBER", "rules:configure"), /Forbidden/);
    strict_1.default.doesNotThrow(() => (0, permissions_1.requirePermission)("SUPER_ADMIN", "rules:configure"));
});
(0, node_test_1.default)("identifies admin route roles", () => {
    strict_1.default.equal((0, permissions_1.isAdminRole)("OPS_ADMIN"), true);
    strict_1.default.equal((0, permissions_1.isAdminRole)("COMPLIANCE_REVIEWER"), true);
    strict_1.default.equal((0, permissions_1.isAdminRole)("MEMBER"), false);
});
(0, node_test_1.default)("returns role permissions map entries", () => {
    strict_1.default.equal((0, permissions_1.getRolePermissions)("SUPPORT").includes("ticket:respond"), true);
});
