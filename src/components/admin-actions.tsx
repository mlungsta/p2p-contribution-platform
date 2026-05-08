"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiActionMessage, callRuntimeApi, useActionState } from "@/components/runtime-api-client";

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

type OverrideContext = {
  offers: Array<{ id: string; remainingAmountMinor: number; status: string; ownerUserId: string }>;
  requests: Array<{ id: string; remainingAmountMinor: number; status: string; ownerUserId: string }>;
};

type DisputeItem = { id: string; status: string; matchId: string; openedByUserId: string };

export function RunBatchPanel() {
  const state = useActionState();

  async function runBatch() {
    state.reset();
    state.setLoading(true);
    const result = await callRuntimeApi("/api/matching/run-batch", {
      method: "POST",
      body: JSON.stringify({ batchRunId: id("batch"), idempotencyKey: id("idem") })
    });
    state.setLoading(false);
    if (result.ok) state.setSuccess("Batch matching started.");
    else state.setError(result.error);
  }

  return (
    <div className="card space-y-3">
      <button data-testid="run-batch" type="button" className="btn-primary" onClick={() => void runBatch()} disabled={state.loading}>{state.loading ? "Running..." : "Run Batch Matching"}</button>
      <ApiActionMessage success={state.success} error={state.error} />
    </div>
  );
}

export function OverridePanel() {
  const state = useActionState();
  const [ctxLoading, setCtxLoading] = useState(false);
  const [context, setContext] = useState<OverrideContext>({ offers: [], requests: [] });
  const [offerId, setOfferId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [amountMinor, setAmountMinor] = useState("1000");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    async function loadContext() {
      setCtxLoading(true);
      const result = await callRuntimeApi<OverrideContext>("/api/admin/override-context", { method: "GET" });
      if (active && result.ok) {
        setContext(result.data);
        if (result.data.offers[0]) setOfferId(result.data.offers[0].id);
        if (result.data.requests[0]) setRequestId(result.data.requests[0].id);
      }
      if (active) setCtxLoading(false);
    }
    void loadContext();
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    state.reset();
    state.setLoading(true);
    const result = await callRuntimeApi("/api/admin/overrides", {
      method: "POST",
      headers: { "x-step-up-authenticated": "true" },
      body: JSON.stringify({ batchRunId: id("ovr"), offerId, requestId, amountMinor: Number(amountMinor), reason })
    });
    state.setLoading(false);
    if (result.ok) state.setSuccess("Override executed.");
    else state.setError(result.error);
  }

  return (
    <form className="card space-y-3" onSubmit={submit}>
      <p className="text-sm font-semibold">Override Match (SUPER_ADMIN only)</p>
      {ctxLoading ? <p className="text-xs text-slate-500">Loading override context...</p> : null}
      <label className="block text-xs text-slate-600">Offer
        <select data-testid="override-offer-select" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={offerId} onChange={(e) => setOfferId(e.target.value)}>
          {context.offers.length === 0 ? <option value="">No offers available</option> : null}
          {context.offers.map((o) => <option key={o.id} value={o.id}>{o.id} ({o.status}, {o.remainingAmountMinor})</option>)}
        </select>
      </label>
      <label className="block text-xs text-slate-600">Request
        <select data-testid="override-request-select" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={requestId} onChange={(e) => setRequestId(e.target.value)}>
          {context.requests.length === 0 ? <option value="">No requests available</option> : null}
          {context.requests.map((r) => <option key={r.id} value={r.id}>{r.id} ({r.status}, {r.remainingAmountMinor})</option>)}
        </select>
      </label>
      <input data-testid="override-amount" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="amount_minor" value={amountMinor} onChange={(e) => setAmountMinor(e.target.value)} />
      <input data-testid="override-reason" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button data-testid="submit-override" type="submit" className="btn-muted" disabled={state.loading || reason.trim().length < 3 || !offerId || !requestId}>{state.loading ? "Submitting..." : "Submit Override"}</button>
      {context.offers.length === 0 || context.requests.length === 0 ? <p className="text-sm text-slate-600">No override candidates available right now.</p> : null}
      <ApiActionMessage success={state.success} error={state.error} />
    </form>
  );
}

export function ResolveDisputePanel() {
  const state = useActionState();
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [disputeId, setDisputeId] = useState("");
  const [resolutionNote, setResolutionNote] = useState("Evidence reviewed");

  useEffect(() => {
    let active = true;
    async function load() {
      const result = await callRuntimeApi<DisputeItem[]>("/api/admin/disputes", { method: "GET" });
      if (active && result.ok) {
        setDisputes(result.data);
        if (result.data[0]) setDisputeId(result.data[0].id);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    state.reset();
    state.setLoading(true);
    const result = await callRuntimeApi("/api/disputes", {
      method: "PATCH",
      body: JSON.stringify({ disputeId, resolutionNote })
    });
    state.setLoading(false);
    if (result.ok) state.setSuccess("Dispute resolved.");
    else state.setError(result.error);
  }

  return (
    <form className="card space-y-3" onSubmit={submit}>
      {disputes.length === 0 ? <p data-testid="empty-admin-disputes" className="text-sm text-slate-600">No disputes yet.</p> : null}
      <select data-testid="resolve-dispute-select" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={disputeId} onChange={(e) => setDisputeId(e.target.value)}>
        {disputes.length === 0 ? <option value="">No disputes available</option> : null}
        {disputes.map((d) => <option key={d.id} value={d.id}>{d.id} ({d.status})</option>)}
      </select>
      <textarea data-testid="resolve-note" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
      <button data-testid="resolve-dispute" type="submit" className="btn-primary" disabled={state.loading || !disputeId}>{state.loading ? "Resolving..." : "Resolve Dispute"}</button>
      <ApiActionMessage success={state.success} error={state.error} />
    </form>
  );
}

export function AuditLogPanel() {
  const state = useActionState();
  const [items, setItems] = useState<Array<{ action: string; entityType: string; correlationId: string }>>([]);

  async function load() {
    state.reset();
    state.setLoading(true);
    const result = await callRuntimeApi<Array<{ action: string; entityType: string; correlationId: string }>>("/api/admin/audit-logs", { method: "GET" });
    state.setLoading(false);
    if (result.ok) {
      setItems(result.data);
      state.setSuccess("Audit logs loaded.");
    } else {
      state.setError(result.error);
    }
  }

  return (
    <div className="card space-y-3">
      <button data-testid="load-audit-logs" type="button" className="btn-muted" onClick={() => void load()} disabled={state.loading}>{state.loading ? "Loading..." : "Load Audit Logs"}</button>
      <ApiActionMessage success={state.success} error={state.error} />
      {items.length === 0 ? <p data-testid="empty-audit-logs" className="text-sm text-slate-600">No audit log entries loaded yet.</p> : null}
      <ul className="space-y-1 text-xs text-slate-700">
        {items.map((item, idx) => <li key={`${item.correlationId}_${idx}`}>{item.action} / {item.entityType} / {item.correlationId}</li>)}
      </ul>
    </div>
  );
}

export function SafeModePanel() {
  const state = useActionState();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  async function readMode() {
    state.reset();
    state.setLoading(true);
    const result = await callRuntimeApi<{ enabled: boolean }>("/api/admin/safe-mode", { method: "GET" });
    state.setLoading(false);
    if (result.ok) {
      setEnabled(result.data.enabled);
      state.setSuccess("Safe mode status loaded.");
    } else {
      state.setError(result.error);
    }
  }

  async function toggleMode(next: boolean) {
    state.reset();
    state.setLoading(true);
    const result = await callRuntimeApi<{ enabled: boolean }>("/api/admin/safe-mode", {
      method: "PATCH",
      headers: { "x-step-up-authenticated": "true" },
      body: JSON.stringify({ enabled: next })
    });
    state.setLoading(false);
    if (result.ok) {
      setEnabled(result.data.enabled);
      state.setSuccess(`Safe mode ${result.data.enabled ? "enabled" : "disabled"}.`);
    } else {
      state.setError(result.error);
    }
  }

  return (
    <div className="card space-y-3">
      <button data-testid="refresh-safe-mode" type="button" className="btn-muted" onClick={() => void readMode()} disabled={state.loading}>Refresh Safe Mode</button>
      <div className="flex gap-2">
        <button data-testid="enable-safe-mode" type="button" className="btn-muted" onClick={() => void toggleMode(true)} disabled={state.loading}>Enable</button>
        <button data-testid="disable-safe-mode" type="button" className="btn-muted" onClick={() => void toggleMode(false)} disabled={state.loading}>Disable</button>
      </div>
      {enabled !== null ? <p data-testid="safe-mode-state" className="text-sm text-slate-700">Current safe mode: {enabled ? "ON" : "OFF"}</p> : <p className="text-sm text-slate-600">Safe mode state not loaded yet.</p>}
      <ApiActionMessage success={state.success} error={state.error} />
    </div>
  );
}
