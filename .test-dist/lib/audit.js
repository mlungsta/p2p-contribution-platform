"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryAuditRepository = exports.AuditService = exports.auditEventSchema = void 0;
exports.createAuditService = createAuditService;
const zod_1 = require("zod");
const auditMetadataSchema = zod_1.z.record(zod_1.z.unknown());
exports.auditEventSchema = zod_1.z.object({
    actorUserId: zod_1.z.string().min(1),
    actorRole: zod_1.z.custom(),
    triggerSource: zod_1.z.string().min(1),
    correlationId: zod_1.z.string().min(1),
    batchRunId: zod_1.z.string().min(1).optional(),
    action: zod_1.z.string().min(1),
    entityType: zod_1.z.string().min(1),
    entityId: zod_1.z.string().min(1),
    beforeState: zod_1.z.record(zod_1.z.unknown()).optional(),
    afterState: zod_1.z.record(zod_1.z.unknown()).optional(),
    reason: zod_1.z.string().min(1).optional(),
    dedupeKey: zod_1.z.string().min(1).optional(),
    occurredAt: zod_1.z.date().optional(),
    metadata: auditMetadataSchema.optional()
});
class AuditService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async log(event) {
        const validated = exports.auditEventSchema.parse({
            ...event,
            occurredAt: event.occurredAt ?? new Date()
        });
        await this.repository.create(validated);
    }
}
exports.AuditService = AuditService;
class InMemoryAuditRepository {
    entries = [];
    dedupe = new Set();
    async create(entry) {
        if (entry.dedupeKey && this.dedupe.has(entry.dedupeKey)) {
            return;
        }
        if (entry.dedupeKey) {
            this.dedupe.add(entry.dedupeKey);
        }
        this.entries.push(entry);
    }
    getAll() {
        return this.entries;
    }
}
exports.InMemoryAuditRepository = InMemoryAuditRepository;
function createAuditService(repository) {
    return new AuditService(repository);
}
