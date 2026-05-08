import { z } from "zod";
import type { AppRole } from "@/lib/permissions";

const auditMetadataSchema = z.record(z.unknown());

export const auditEventSchema = z.object({
  actorUserId: z.string().min(1),
  actorRole: z.custom<AppRole>(),
  triggerSource: z.string().min(1),
  correlationId: z.string().min(1),
  batchRunId: z.string().min(1).optional(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  beforeState: z.record(z.unknown()).optional(),
  afterState: z.record(z.unknown()).optional(),
  reason: z.string().min(1).optional(),
  dedupeKey: z.string().min(1).optional(),
  occurredAt: z.date().optional(),
  metadata: auditMetadataSchema.optional()
});

export type AuditEventInput = z.infer<typeof auditEventSchema>;

export interface AuditLogger {
  log(event: AuditEventInput): Promise<void>;
}

export interface AuditRepository {
  create(entry: AuditEventInput): Promise<void>;
}

export class AuditService implements AuditLogger {
  constructor(private readonly repository: AuditRepository) {}

  async log(event: AuditEventInput): Promise<void> {
    const validated = auditEventSchema.parse({
      ...event,
      occurredAt: event.occurredAt ?? new Date()
    });

    await this.repository.create(validated);
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  private entries: AuditEventInput[] = [];
  private dedupe = new Set<string>();

  async create(entry: AuditEventInput): Promise<void> {
    if (entry.dedupeKey && this.dedupe.has(entry.dedupeKey)) {
      return;
    }

    if (entry.dedupeKey) {
      this.dedupe.add(entry.dedupeKey);
    }

    this.entries.push(entry);
  }

  getAll(): AuditEventInput[] {
    return this.entries;
  }
}

export function createAuditService(repository: AuditRepository): AuditLogger {
  return new AuditService(repository);
}
