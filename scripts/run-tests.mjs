import assert from "node:assert/strict";
import { hasPermission, isAdminRole, requirePermission, roles } from "../.test-dist/lib/permissions.js";
import { AuditService, InMemoryAuditRepository, auditEventSchema, createAuditService } from "../.test-dist/lib/audit.js";
import { paginationSchema, validateInput } from "../.test-dist/lib/validation.js";
import { runAdminOverrideMatching, runBatchMatching, runBatchMatchingInTransaction } from "../.test-dist/lib/matching.js";
import { validateLedgerInvariant } from "../.test-dist/lib/ledger.js";
import {
  auditDisputeResolution,
  ensurePostedEntryDeleteGuard,
  ensurePostedEntryImmutableServiceGuard,
  postLedgerTransaction,
  reverseLedgerTransaction
} from "../.test-dist/server/services/ledger-service.js";
import { RuntimeApiService, executeWithErrorHandling } from "../.test-dist/server/services/runtime-api-service.js";
import { canAccessAdmin, canModifyOperationalState, canOverrideMatching, canViewAuditLogs, safeModeMessage, statusTone } from "../.test-dist/lib/ui-shell.js";

class MockPrisma {
  constructor() {
    this.batchRuns = new Map();
    this.matches = [];
    this.offerLocksAvailable = true;
    this.requestLocksAvailable = true;

    this.offers = [
      {
        id: "offer_tx_1",
        ownerUserId: "payer_tx_1",
        remainingAmountMinor: 10000,
        accumulationBatchAt: new Date("2026-05-05T08:00:00.000Z"),
        createdAt: new Date("2026-05-05T07:00:00.000Z"),
        owner: { memberStatus: "APPROVED", openedDisputes: [] },
        status: "ACTIVE"
      }
    ];

    this.requests = [
      {
        id: "req_tx_1",
        ownerUserId: "rec_tx_1",
        remainingAmountMinor: 10000,
        owner: { memberStatus: "APPROVED", openedDisputes: [] },
        status: "ACTIVE"
      }
    ];

    this.matchingBatchRun = {
      findUnique: async ({ where }) => this.batchRuns.get(where.batchRunId) ?? null
    };
  }

  async $transaction(fn) {
    const tx = {
      $queryRawUnsafe: async (query) => {
        if (String(query).includes("FROM contribution_offers")) {
          if (!this.offerLocksAvailable) return [];
          this.offerLocksAvailable = false;
          return this.offers.map((o) => ({ id: o.id }));
        }

        if (String(query).includes("FROM recipient_requests")) {
          if (!this.requestLocksAvailable) return [];
          this.requestLocksAvailable = false;
          return this.requests.map((r) => ({ id: r.id }));
        }

        return [];
      },
      match: {
        count: async ({ where }) => this.matches.filter((m) => m.batchRunId === where.batchRunId).length,
        findMany: async () => this.matches.map((m) => ({ senderUserId: m.senderUserId })),
        createMany: async ({ data }) => {
          const row = Array.isArray(data) ? data[0] : data;
          if (this.matches.some((m) => m.matchReference === row.matchReference)) {
            return { count: 0 };
          }
          this.matches.push(row);
          return { count: 1 };
        },
        create: async ({ data }) => {
          this.matches.push(data);
          return data;
        }
      },
      contributionOffer: {
        findMany: async ({ where }) => this.offers.filter((o) => where.id.in.includes(o.id)),
        update: async ({ where, data }) => {
          const offer = this.offers.find((o) => o.id === where.id);
          if (!offer) return null;
          offer.remainingAmountMinor -= data.remainingAmountMinor.decrement;
          return offer;
        }
      },
      recipientRequest: {
        findMany: async ({ where }) => this.requests.filter((r) => where.id.in.includes(r.id)),
        update: async ({ where, data }) => {
          const request = this.requests.find((r) => r.id === where.id);
          if (!request) return null;
          request.remainingAmountMinor -= data.remainingAmountMinor.decrement;
          return request;
        }
      },
      matchingBatchRun: {
        upsert: async ({ where, create }) => {
          const existing = this.batchRuns.get(create.batchRunId);
          if (existing) return existing;
          const record = {
            batchRunId: create.batchRunId,
            idempotencyKey: where.idempotencyKey,
            status: "STARTED"
          };
          this.batchRuns.set(create.batchRunId, record);
          return record;
        },
        update: async ({ where, data }) => {
          const existing = this.batchRuns.get(where.batchRunId);
          if (!existing) return null;
          const updated = { ...existing, ...data };
          this.batchRuns.set(where.batchRunId, updated);
          return updated;
        }
      }
    };

    return fn(tx);
  }
}

class MockLedgerPrisma {
  constructor() {
    this.accounts = [{ id: "acc1" }, { id: "acc2" }];
    this.transactions = [];
    this.entries = [];
    this.nextId = 1;
  }

  _id(prefix) {
    this.nextId += 1;
    return `${prefix}_${this.nextId}`;
  }

  ledgerTransaction = {
    findUnique: async ({ where, include }) => {
      let tx = null;
      if (where.idempotencyKey) {
        tx = this.transactions.find((t) => t.idempotencyKey === where.idempotencyKey) ?? null;
      } else if (where.id) {
        tx = this.transactions.find((t) => t.id === where.id) ?? null;
      }
      if (!tx) return null;
      if (!include?.entries) return tx;
      return { ...tx, entries: this.entries.filter((e) => e.ledgerTransactionId === tx.id) };
    },
    create: async ({ data }) => {
      const tx = { id: this._id("tx"), ...data };
      this.transactions.push(tx);
      return tx;
    },
    update: async ({ where, data, include }) => {
      const idx = this.transactions.findIndex((t) => t.id === where.id);
      if (idx < 0) throw new Error("tx not found");
      this.transactions[idx] = { ...this.transactions[idx], ...data };
      const tx = this.transactions[idx];
      if (include?.entries) return { ...tx, entries: this.entries.filter((e) => e.ledgerTransactionId === tx.id) };
      return tx;
    }
  };

  ledgerEntry = {
    create: async ({ data }) => {
      const entry = { id: this._id("entry"), ...data };
      this.entries.push(entry);
      return entry;
    },
    findUnique: async ({ where, include }) => {
      const entry = this.entries.find((e) => e.id === where.id) ?? null;
      if (!entry) return null;
      if (!include?.ledgerTransaction) return entry;
      const tx = this.transactions.find((t) => t.id === entry.ledgerTransactionId) ?? null;
      return { ...entry, ledgerTransaction: tx };
    },
    update: async ({ where, data }) => {
      const idx = this.entries.findIndex((e) => e.id === where.id);
      if (idx < 0) throw new Error("entry not found");
      this.entries[idx] = { ...this.entries[idx], ...data };
      return this.entries[idx];
    },
    delete: async ({ where }) => {
      const idx = this.entries.findIndex((e) => e.id === where.id);
      if (idx < 0) throw new Error("entry not found");
      const [deleted] = this.entries.splice(idx, 1);
      return deleted;
    }
  };

  async $transaction(fn) {
    const tx = {
      ledgerTransaction: this.ledgerTransaction,
      ledgerEntry: this.ledgerEntry
    };
    const result = await fn(tx);
    const last = this.transactions.find((t) => t.id === result.id);
    if (last?.status === "POSTED") {
      const lines = this.entries.filter((e) => e.ledgerTransactionId === last.id);
      const debit = lines.reduce((s, l) => s + l.debitAmountMinor, 0);
      const credit = lines.reduce((s, l) => s + l.creditAmountMinor, 0);
      if (debit !== credit) {
        throw new Error("Cannot post unbalanced ledger transaction");
      }
    }
    return result;
  }
}

class MockRuntimePrisma {
  constructor() {
    this.safeMode = false;
    this.users = [];
    this.offers = [];
    this.requests = [];
    this.matches = [];
    this.disputes = [];
    this.proofs = [];
    this.auditLogs = [];
  }
  id(prefix) {
    return `${prefix}_${Math.floor(Math.random() * 1_000_000)}`;
  }

  systemSetting = {
    findUnique: async ({ where }) => {
      if (where.key !== "SAFE_MODE" || !this.safeMode) return null;
      return { key: "SAFE_MODE", value: { enabled: true } };
    }
  };
  contributionOffer = {
    create: async ({ data }) => {
      const row = { id: this.id("offer"), createdAt: new Date(), accumulationBatchAt: null, ...data };
      this.offers.push(row);
      return row;
    },
    findUnique: async ({ where, include }) => {
      const row = this.offers.find((o) => o.id === where.id) ?? null;
      if (!row || !include?.owner) return row;
      return {
        ...row,
        owner: { memberStatus: "APPROVED", openedDisputes: [] }
      };
    }
  };
  recipientRequest = {
    create: async ({ data }) => {
      const row = { id: this.id("req"), createdAt: new Date(), ...data };
      this.requests.push(row);
      return row;
    },
    findUnique: async ({ where, include }) => {
      const row = this.requests.find((r) => r.id === where.id) ?? null;
      if (!row || !include?.owner) return row;
      return {
        ...row,
        owner: { memberStatus: "APPROVED", openedDisputes: [] }
      };
    }
  };
  match = {
    findUnique: async ({ where }) => this.matches.find((m) => m.id === where.id) ?? null,
    update: async ({ where, data }) => {
      const idx = this.matches.findIndex((m) => m.id === where.id);
      if (idx < 0) throw new Error("match not found");
      this.matches[idx] = { ...this.matches[idx], ...data };
      return this.matches[idx];
    }
  };
  proofOfPayment = {
    create: async ({ data }) => {
      if (!this.matches.find((m) => m.id === data.matchId)) {
        const err = new Error("fk");
        err.code = "P2003";
        throw err;
      }
      const row = { id: this.id("proof"), ...data };
      this.proofs.push(row);
      return row;
    }
  };
  dispute = {
    create: async ({ data }) => {
      const row = { id: this.id("dispute"), ...data };
      this.disputes.push(row);
      return row;
    },
    findUnique: async ({ where, include }) => {
      const d = this.disputes.find((x) => x.id === where.id) ?? null;
      if (!d || !include?.match) return d;
      const match = this.matches.find((m) => m.id === d.matchId);
      return { ...d, match };
    },
    update: async ({ where, data }) => {
      const idx = this.disputes.findIndex((d) => d.id === where.id);
      if (idx < 0) throw new Error("dispute not found");
      this.disputes[idx] = { ...this.disputes[idx], ...data };
      return this.disputes[idx];
    }
  };
  auditLog = { create: async ({ data }) => { this.auditLogs.push(data); return data; } };

  // used by matching call path but not exercised in these runtime-boundary tests
  matchingBatchRun = { findUnique: async () => null };
  $transaction = async (fn) => fn(this);
}

async function run() {
  assert.deepEqual(roles, ["MEMBER", "SUPPORT", "OPS_ADMIN", "SUPER_ADMIN", "COMPLIANCE_REVIEWER"]);
  assert.equal(hasPermission("SUPER_ADMIN", "audit:view"), true);
  assert.equal(hasPermission("COMPLIANCE_REVIEWER", "audit:view"), true);
  assert.equal(hasPermission("MEMBER", "audit:view"), false);
  assert.throws(() => requirePermission("MEMBER", "rules:configure"), /Forbidden/);
  assert.equal(isAdminRole("OPS_ADMIN"), true);
  assert.equal(isAdminRole("MEMBER"), false);
  assert.equal(canAccessAdmin("MEMBER"), false);
  assert.equal(canAccessAdmin("COMPLIANCE_REVIEWER"), true);
  assert.equal(canModifyOperationalState("COMPLIANCE_REVIEWER"), false);
  assert.equal(canViewAuditLogs("COMPLIANCE_REVIEWER"), true);
  assert.equal(canOverrideMatching("SUPER_ADMIN"), true);
  assert.equal(statusTone("DISPUTED"), "danger");
  assert.equal(statusTone("WAITING_FOR_POOL"), "warning");
  assert.equal(statusTone("CONFIRMED"), "positive");
  assert.equal(safeModeMessage(true).includes("Safe mode active"), true);

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
    beforeState: { status: "CREATED" },
    afterState: { status: "ASSIGNED" },
    metadata: { reason: "manual override" }
  });
  assert.equal(repository.getAll().length, 1);
  assert.equal(repository.getAll()[0]?.action, "admin.match.override");
  assert.equal(repository.getAll()[0]?.occurredAt instanceof Date, true);

  await service.log({
    actorUserId: "user_1",
    actorRole: "SUPER_ADMIN",
    triggerSource: "manual",
    correlationId: "corr-1",
    action: "admin.match.override",
    entityType: "MATCH",
    entityId: "match_1",
    dedupeKey: "same-key"
  });
  await service.log({
    actorUserId: "user_1",
    actorRole: "SUPER_ADMIN",
    triggerSource: "manual",
    correlationId: "corr-1",
    action: "admin.match.override",
    entityType: "MATCH",
    entityId: "match_1",
    dedupeKey: "same-key"
  });
  assert.equal(repository.getAll().filter((e) => e.dedupeKey === "same-key").length, 1);

  const rawService = new AuditService(repository);
  await assert.rejects(() =>
    rawService.log({
      actorUserId: "",
      actorRole: "MEMBER",
      triggerSource: "batch",
      correlationId: "corr-2",
      action: "",
      entityType: "",
      entityId: ""
    })
  );

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

  const page = validateInput(paginationSchema, { page: "2", pageSize: "50" });
  assert.equal(page.page, 2);
  assert.equal(page.pageSize, 50);
  assert.throws(() => validateInput(paginationSchema, { page: 0, pageSize: 1000 }), /Validation failed/);

  const now = new Date("2026-05-05T10:00:00.000Z");
  const actor = {
    actorUserId: "system",
    actorRole: "SUPER_ADMIN",
    triggerSource: "cron",
    correlationId: "corr-batch-1"
  };

  const normalAudit = new InMemoryAuditRepository();
  const normalMatch = await runBatchMatching({
    batchRunId: "batch_1",
    idempotencyKey: "idem_1",
    offers: [{ id: "offer_1", payerUserId: "payer_1", remainingAmountMinor: 10000, accumulationWindowClosesAt: new Date("2026-05-05T08:00:00.000Z"), memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
    recipientRequests: [{ id: "req_1", recipientUserId: "rec_1", remainingAmountMinor: 10000, memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
    activeMatches: [],
    config: { now },
    actor,
    auditLogger: createAuditService(normalAudit)
  });
  assert.equal(normalMatch.createdMatches.length, 1);
  assert.equal(normalMatch.createdMatches[0].amountMinor, 10000);

  const partialMatch = await runBatchMatching({
    batchRunId: "batch_2",
    idempotencyKey: "idem_2",
    offers: [{ id: "offer_2", payerUserId: "payer_2", remainingAmountMinor: 4000, accumulationWindowClosesAt: new Date("2026-05-05T08:00:00.000Z"), memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
    recipientRequests: [{ id: "req_2", recipientUserId: "rec_2", remainingAmountMinor: 10000, memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
    activeMatches: [],
    config: { now },
    actor,
    auditLogger: createAuditService(new InMemoryAuditRepository())
  });
  assert.equal(partialMatch.createdMatches.length, 1);
  assert.equal(partialMatch.createdMatches[0].amountMinor, 4000);

  const suspendedSkipped = await runBatchMatching({
    batchRunId: "batch_3",
    idempotencyKey: "idem_3",
    offers: [{ id: "offer_3", payerUserId: "payer_3", remainingAmountMinor: 9000, accumulationWindowClosesAt: new Date("2026-05-05T08:00:00.000Z"), memberStatus: "SUSPENDED", unresolvedDisputeStatuses: [] }],
    recipientRequests: [{ id: "req_3", recipientUserId: "rec_3", remainingAmountMinor: 9000, memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
    activeMatches: [],
    config: { now },
    actor,
    auditLogger: createAuditService(new InMemoryAuditRepository())
  });
  assert.equal(suspendedSkipped.createdMatches.length, 0);

  const disputedSkipped = await runBatchMatching({
    batchRunId: "batch_4",
    idempotencyKey: "idem_4",
    offers: [{ id: "offer_4", payerUserId: "payer_4", remainingAmountMinor: 9000, accumulationWindowClosesAt: new Date("2026-05-05T08:00:00.000Z"), memberStatus: "APPROVED", unresolvedDisputeStatuses: ["OPEN"] }],
    recipientRequests: [{ id: "req_4", recipientUserId: "rec_4", remainingAmountMinor: 9000, memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
    activeMatches: [],
    config: { now },
    actor,
    auditLogger: createAuditService(new InMemoryAuditRepository())
  });
  assert.equal(disputedSkipped.createdMatches.length, 0);

  const overrideDeniedAudit = new InMemoryAuditRepository();
  await assert.rejects(() =>
    runAdminOverrideMatching({
      batchRunId: "batch_5",
      offer: { id: "offer_5", payerUserId: "payer_5", remainingAmountMinor: 10000, accumulationWindowClosesAt: new Date("2026-05-05T08:00:00.000Z"), memberStatus: "APPROVED", unresolvedDisputeStatuses: [] },
      request: { id: "req_5", recipientUserId: "rec_5", remainingAmountMinor: 10000, memberStatus: "APPROVED", unresolvedDisputeStatuses: [] },
      amountMinor: 5000,
      reason: "need override",
      actor: { actorUserId: "ops_1", actorRole: "OPS_ADMIN", triggerSource: "manual", correlationId: "corr-override-denied" },
      auditLogger: createAuditService(overrideDeniedAudit),
      now
    })
  );

  const overrideAllowedAudit = new InMemoryAuditRepository();
  const overrideMatch = await runAdminOverrideMatching({
    batchRunId: "batch_6",
    offer: { id: "offer_6", payerUserId: "payer_6", remainingAmountMinor: 10000, accumulationWindowClosesAt: new Date("2026-05-05T08:00:00.000Z"), memberStatus: "APPROVED", unresolvedDisputeStatuses: [] },
    request: { id: "req_6", recipientUserId: "rec_6", remainingAmountMinor: 10000, memberStatus: "APPROVED", unresolvedDisputeStatuses: [] },
    amountMinor: 5000,
    reason: "approved by super admin",
    actor: { actorUserId: "super_1", actorRole: "SUPER_ADMIN", triggerSource: "manual", correlationId: "corr-override-ok" },
    auditLogger: createAuditService(overrideAllowedAudit),
    now
  });
  assert.equal(overrideMatch.amountMinor, 5000);
  assert.equal(overrideAllowedAudit.getAll().length, 1);
  assert.equal(overrideAllowedAudit.getAll()[0]?.reason, "approved by super admin");

  await assert.rejects(() =>
    runBatchMatching({
      batchRunId: "batch_7",
      idempotencyKey: "idem_7",
      offers: [{ id: "offer_7", payerUserId: "payer_7", remainingAmountMinor: 10.5, accumulationWindowClosesAt: new Date("2026-05-05T08:00:00.000Z"), memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
      recipientRequests: [{ id: "req_7", recipientUserId: "rec_7", remainingAmountMinor: 1000, memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
      activeMatches: [],
      config: { now },
      actor,
      auditLogger: createAuditService(new InMemoryAuditRepository())
    })
  );

  const mockPrisma = new MockPrisma();
  const txAudit = createAuditService(new InMemoryAuditRepository());

  const firstWorker = await runBatchMatchingInTransaction({
    prisma: mockPrisma,
    batchRunId: "tx_batch_1",
    idempotencyKey: "tx_idem_1",
    actor,
    now,
    auditLogger: txAudit
  });

  const secondWorkerSameBatch = await runBatchMatchingInTransaction({
    prisma: mockPrisma,
    batchRunId: "tx_batch_1",
    idempotencyKey: "tx_idem_1",
    actor,
    now,
    auditLogger: txAudit
  });

  assert.equal(firstWorker.createdCount, 1);
  assert.equal(secondWorkerSameBatch.createdCount, 0);

  const retryRun = await runBatchMatchingInTransaction({
    prisma: mockPrisma,
    batchRunId: "tx_batch_1",
    idempotencyKey: "tx_idem_1",
    actor,
    now,
    auditLogger: txAudit
  });
  assert.equal(retryRun.createdCount, 0);

  assert.equal(
    validateLedgerInvariant([
      { debitAmountMinor: 1000, creditAmountMinor: 0 },
      { debitAmountMinor: 0, creditAmountMinor: 1000 }
    ]),
    true
  );

  assert.equal(
    validateLedgerInvariant([
      { debitAmountMinor: 1000, creditAmountMinor: 0 },
      { debitAmountMinor: 0, creditAmountMinor: 900 }
    ]),
    false
  );

  await assert.rejects(() =>
    runBatchMatching({
      batchRunId: "batch_8",
      idempotencyKey: "idem_8",
      offers: [{ id: "offer_8", payerUserId: "payer_8", remainingAmountMinor: 1000, accumulationWindowClosesAt: new Date("2026-05-05T08:00:00.000Z"), memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
      recipientRequests: [{ id: "req_8", recipientUserId: "rec_8", remainingAmountMinor: 1000, memberStatus: "APPROVED", unresolvedDisputeStatuses: [] }],
      activeMatches: [],
      config: { now, enableGuaranteedRoi: true },
      actor,
      auditLogger: createAuditService(new InMemoryAuditRepository())
    })
  );

  const ledgerAuditRepo = new InMemoryAuditRepository();
  const ledgerAudit = createAuditService(ledgerAuditRepo);
  const ledgerPrisma = new MockLedgerPrisma();

  const postedTx = await postLedgerTransaction(ledgerPrisma, ledgerAudit, {
    reference: "ref-1",
    description: "match settlement",
    correlationId: "corr-ledger-1",
    sourceEntityType: "MATCH",
    sourceEntityId: "match_1",
    idempotencyKey: "ledger-idem-1",
    actorUserId: "admin_1",
    actorRole: "SUPER_ADMIN",
    triggerSource: "manual",
    lines: [
      { ledgerAccountId: "acc1", debitAmountMinor: 1000, creditAmountMinor: 0 },
      { ledgerAccountId: "acc2", debitAmountMinor: 0, creditAmountMinor: 1000 }
    ]
  });
  assert.equal(postedTx.status, "POSTED");
  assert.equal(ledgerAuditRepo.getAll().some((e) => e.action === "ledger.transaction.posted"), true);

  await assert.rejects(() =>
    postLedgerTransaction(ledgerPrisma, ledgerAudit, {
      reference: "ref-2",
      correlationId: "",
      sourceEntityType: "MATCH",
      sourceEntityId: "match_2",
      idempotencyKey: "ledger-idem-2",
      actorUserId: "admin_1",
      actorRole: "SUPER_ADMIN",
      triggerSource: "manual",
      lines: [
        { ledgerAccountId: "acc1", debitAmountMinor: 1000, creditAmountMinor: 0 },
        { ledgerAccountId: "acc2", debitAmountMinor: 0, creditAmountMinor: 1000 }
      ]
    })
  );

  await assert.rejects(() =>
    postLedgerTransaction(ledgerPrisma, ledgerAudit, {
      reference: "ref-3",
      correlationId: "corr-ledger-3",
      sourceEntityType: "MATCH",
      sourceEntityId: "match_3",
      idempotencyKey: "ledger-idem-3",
      actorUserId: "admin_1",
      actorRole: "SUPER_ADMIN",
      triggerSource: "manual",
      lines: [
        { ledgerAccountId: "acc1", debitAmountMinor: 1000, creditAmountMinor: 0 },
        { ledgerAccountId: "acc2", debitAmountMinor: 0, creditAmountMinor: 900 }
      ]
    })
  );

  const idempotentLedger = await postLedgerTransaction(ledgerPrisma, ledgerAudit, {
    reference: "ref-1-repeat",
    description: "duplicate should no-op",
    correlationId: "corr-ledger-1",
    sourceEntityType: "MATCH",
    sourceEntityId: "match_1",
    idempotencyKey: "ledger-idem-1",
    actorUserId: "admin_1",
    actorRole: "SUPER_ADMIN",
    triggerSource: "manual",
    lines: [
      { ledgerAccountId: "acc1", debitAmountMinor: 1000, creditAmountMinor: 0 },
      { ledgerAccountId: "acc2", debitAmountMinor: 0, creditAmountMinor: 1000 }
    ]
  });
  assert.equal(idempotentLedger.id, postedTx.id);

  const reversal = await reverseLedgerTransaction(ledgerPrisma, ledgerAudit, {
    originalTransactionId: postedTx.id,
    idempotencyKey: "ledger-rev-1",
    reference: "rev-ref-1",
    reason: "correction",
    correlationId: "corr-ledger-rev-1",
    actorUserId: "admin_1",
    actorRole: "SUPER_ADMIN",
    triggerSource: "manual"
  });
  assert.equal(reversal.status, "POSTED");
  const originalLines = ledgerPrisma.entries.filter((e) => e.ledgerTransactionId === postedTx.id);
  const reversalLines = ledgerPrisma.entries.filter((e) => e.ledgerTransactionId === reversal.id);
  assert.equal(originalLines.length, reversalLines.length);
  assert.equal(reversalLines[0].debitAmountMinor, originalLines[0].creditAmountMinor);

  const postedEntry = ledgerPrisma.entries.find((e) => e.ledgerTransactionId === reversal.id);
  await assert.rejects(() => ensurePostedEntryImmutableServiceGuard(ledgerPrisma, postedEntry.id, { memo: "x" }));
  await assert.rejects(() => ensurePostedEntryDeleteGuard(ledgerPrisma, postedEntry.id));

  await auditDisputeResolution({
    auditLogger: ledgerAudit,
    actorUserId: "ops_1",
    actorRole: "OPS_ADMIN",
    triggerSource: "manual",
    correlationId: "corr-dispute-1",
    disputeId: "dispute_1",
    reason: "verified evidence"
  });
  assert.equal(ledgerAuditRepo.getAll().some((e) => e.action === "dispute.resolved"), true);

  const rtPrisma = new MockRuntimePrisma();
  const runtime = new RuntimeApiService(rtPrisma);

  const memberCtx = { actorUserId: "member_1", actorRole: "MEMBER", correlationId: "corr-rt-1", triggerSource: "test" };
  const supportCtx = { actorUserId: "support_1", actorRole: "SUPPORT", correlationId: "corr-rt-2", triggerSource: "test" };
  const complianceCtx = { actorUserId: "compliance_1", actorRole: "COMPLIANCE_REVIEWER", correlationId: "corr-rt-3", triggerSource: "test" };
  const opsCtx = { actorUserId: "ops_1", actorRole: "OPS_ADMIN", correlationId: "corr-rt-4", triggerSource: "test" };

  // validation failure
  const validationRes = await executeWithErrorHandling(RuntimeApiService.parseContext(memberCtx), () =>
    runtime.createContributionOffer(memberCtx, { amountMinor: 10.5, currency: "USD" })
  );
  assert.equal(validationRes.ok, false);
  assert.equal(validationRes.error.code, "VALIDATION_ERROR");

  // missing correlation_id
  await assert.rejects(() => runtime.createContributionOffer({ ...memberCtx, correlationId: "" }, { amountMinor: 1000, currency: "USD" }));

  // permission denial: member cannot override
  const memberOverride = await executeWithErrorHandling(RuntimeApiService.parseContext(memberCtx), () =>
    runtime.adminOverride(memberCtx, { batchRunId: "b1", offerId: "o1", requestId: "r1", amountMinor: 1000, reason: "valid reason" })
  );
  assert.equal(memberOverride.ok, false);
  assert.equal(memberOverride.error.code, "FORBIDDEN");

  // safe mode blocks risky action for OPS_ADMIN
  rtPrisma.safeMode = true;
  const safeModeBlocked = await executeWithErrorHandling(RuntimeApiService.parseContext(opsCtx), () =>
    runtime.runBatchMatching(opsCtx, { batchRunId: "b2", idempotencyKey: "i2" })
  );
  assert.equal(safeModeBlocked.ok, false);
  assert.equal(safeModeBlocked.error.code, "SAFE_MODE_BLOCKED");
  rtPrisma.safeMode = false;

  // support cannot resolve dispute
  const m = { id: "m1", senderUserId: "member_1", recipientUserId: "member_2", status: "ASSIGNED" };
  rtPrisma.matches.push(m);
  const d = { id: "d1", matchId: "m1", status: "OPEN" };
  rtPrisma.disputes.push(d);
  const supportResolve = await executeWithErrorHandling(RuntimeApiService.parseContext(supportCtx), () =>
    runtime.resolveDispute(supportCtx, { disputeId: "d1", resolutionNote: "done" })
  );
  assert.equal(supportResolve.ok, false);
  assert.equal(supportResolve.error.code, "FORBIDDEN");

  // invalid state transition for confirm
  const recipientCtx = { actorUserId: "member_2", actorRole: "MEMBER", correlationId: "corr-rt-6", triggerSource: "test" };
  const invalidConfirm = await executeWithErrorHandling(RuntimeApiService.parseContext(recipientCtx), () =>
    runtime.confirmReceipt(recipientCtx, { matchId: "m1" })
  );
  assert.equal(invalidConfirm.ok, false);
  assert.equal(invalidConfirm.error.code, "INVALID_STATE");

  // DB constraint/fk error mapped safely
  const proofErr = await executeWithErrorHandling(RuntimeApiService.parseContext(memberCtx), () =>
    runtime.uploadProofMetadata(memberCtx, { matchId: "missing", fileUrl: "https://example.com/p.png" })
  );
  assert.equal(proofErr.ok, false);
  assert.equal(proofErr.error.code === "NOT_FOUND" || proofErr.error.code === "CONSTRAINT_VIOLATION", true);

  // compliance reviewer read-only behavior
  const complianceWrite = await executeWithErrorHandling(RuntimeApiService.parseContext(complianceCtx), () =>
    runtime.createContributionOffer(complianceCtx, { amountMinor: 1000, currency: "USD" })
  );
  assert.equal(complianceWrite.ok, false);
  assert.equal(complianceWrite.error.code, "FORBIDDEN");

  console.log("All tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
