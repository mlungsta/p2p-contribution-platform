"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const audit_1 = require("../lib/audit");
(0, node_test_1.default)("accepts a valid audit event and persists it", async () => {
    const repository = new audit_1.InMemoryAuditRepository();
    const service = (0, audit_1.createAuditService)(repository);
    await service.log({
        actorUserId: "user_1",
        actorRole: "SUPER_ADMIN",
        triggerSource: "manual",
        correlationId: "corr-1",
        action: "admin.match.override",
        entityType: "MATCH",
        entityId: "match_1",
        metadata: { reason: "manual override" }
    });
    strict_1.default.equal(repository.getAll().length, 1);
    strict_1.default.equal(repository.getAll()[0]?.action, "admin.match.override");
});
(0, node_test_1.default)("rejects invalid audit event payload", async () => {
    const repository = new audit_1.InMemoryAuditRepository();
    const service = new audit_1.AuditService(repository);
    await strict_1.default.rejects(async () => {
        await service.log({
            actorUserId: "",
            actorRole: "MEMBER",
            triggerSource: "batch",
            correlationId: "corr-2",
            action: "",
            entityType: "",
            entityId: ""
        });
    });
});
(0, node_test_1.default)("exposes schema for shared validation", () => {
    const parsed = audit_1.auditEventSchema.safeParse({
        actorUserId: "u1",
        actorRole: "MEMBER",
        triggerSource: "batch",
        correlationId: "corr-2",
        action: "test",
        entityType: "AUDIT",
        entityId: "1"
    });
    strict_1.default.equal(parsed.success, true);
});
