import test from "node:test";
import assert from "node:assert/strict";
import { AuditService, InMemoryAuditRepository, auditEventSchema, createAuditService } from "../lib/audit";

test("accepts a valid audit event and persists it", async () => {
  const repository = new InMemoryAuditRepository();
  const service = createAuditService(repository);

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

  assert.equal(repository.getAll().length, 1);
  assert.equal(repository.getAll()[0]?.action, "admin.match.override");
});

test("rejects invalid audit event payload", async () => {
  const repository = new InMemoryAuditRepository();
  const service = new AuditService(repository);

  await assert.rejects(async () => {
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

test("exposes schema for shared validation", () => {
  const parsed = auditEventSchema.safeParse({
    actorUserId: "u1",
    actorRole: "MEMBER",
    triggerSource: "batch",
    correlationId: "corr-2",
    action: "test",
    entityType: "AUDIT",
    entityId: "1"
  });

  assert.equal(parsed.success, true);
});
