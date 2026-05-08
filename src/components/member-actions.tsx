"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiActionMessage, callRuntimeApi, useActionState } from "@/components/runtime-api-client";

type HistoryPayload = {
  contributionOffers?: Array<{ id: string; status: string }>;
  recipientRequests?: Array<{ id: string; status: string }>;
  sentMatches?: Array<{ id: string; status: string; recipientUserId: string }>;
  receivedMatches?: Array<{ id: string; status: string; senderUserId: string }>;
  openedDisputes?: Array<{ id: string; status: string }>;
};

function useMemberHistoryData() {
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const result = await callRuntimeApi<HistoryPayload>("/api/member/history", { method: "GET" });
      if (active && result.ok) {
        setData(result.data);
      }
      if (active) setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return { data, loading };
}

export function ContributionActionsPanel() {
  const offer = useActionState();
  const request = useActionState();
  const [offerAmount, setOfferAmount] = useState("10000");
  const [requestAmount, setRequestAmount] = useState("10000");

  async function submitOffer(e: FormEvent) {
    e.preventDefault();
    offer.reset();
    offer.setLoading(true);
    const result = await callRuntimeApi("/api/contribution-offers", {
      method: "POST",
      body: JSON.stringify({ amountMinor: Number(offerAmount), currency: "USD" })
    });
    offer.setLoading(false);
    if (result.ok) offer.setSuccess("Contribution offer submitted.");
    else offer.setError(result.error);
  }

  async function submitRequest(e: FormEvent) {
    e.preventDefault();
    request.reset();
    request.setLoading(true);
    const result = await callRuntimeApi("/api/recipient-requests", {
      method: "POST",
      body: JSON.stringify({ amountMinor: Number(requestAmount), currency: "USD" })
    });
    request.setLoading(false);
    if (result.ok) request.setSuccess("Recipient request submitted.");
    else request.setError(result.error);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="card space-y-3" onSubmit={submitOffer}>
        <h2 className="text-sm font-semibold text-slate-900">Create Contribution Offer</h2>
        <label className="block text-xs text-slate-600">Amount (minor units)
          <input data-testid="offer-amount" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button data-testid="submit-offer" type="submit" className="btn-primary" disabled={offer.loading}>{offer.loading ? "Submitting..." : "Submit Offer"}</button>
        <ApiActionMessage success={offer.success} error={offer.error} />
      </form>

      <form className="card space-y-3" onSubmit={submitRequest}>
        <h2 className="text-sm font-semibold text-slate-900">Create Recipient Request</h2>
        <label className="block text-xs text-slate-600">Amount (minor units)
          <input data-testid="request-amount" value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button data-testid="submit-request" type="submit" className="btn-primary" disabled={request.loading}>{request.loading ? "Submitting..." : "Submit Request"}</button>
        <ApiActionMessage success={request.success} error={request.error} />
      </form>
    </div>
  );
}

export function MatchActionsPanel() {
  const proof = useActionState();
  const confirm = useActionState();
  const { data, loading: historyLoading } = useMemberHistoryData();
  const [matchId, setMatchId] = useState("");
  const [fileUrl, setFileUrl] = useState("https://example.com/proof.png");

  const matchOptions = useMemo(() => {
    const sent = data?.sentMatches ?? [];
    const received = data?.receivedMatches ?? [];
    return [...sent.map((m) => ({ id: m.id, label: `Sent ${m.id} (${m.status})` })), ...received.map((m) => ({ id: m.id, label: `Received ${m.id} (${m.status})` }))];
  }, [data]);

  const selectedMatchId = matchId || matchOptions[0]?.id || "";

  async function uploadProof() {
    proof.reset();
    proof.setLoading(true);
    const result = await callRuntimeApi("/api/proofs", {
      method: "POST",
      body: JSON.stringify({ matchId: selectedMatchId, fileUrl })
    });
    proof.setLoading(false);
    if (result.ok) proof.setSuccess("Proof metadata uploaded.");
    else proof.setError(result.error);
  }

  async function confirmReceipt() {
    confirm.reset();
    confirm.setLoading(true);
    const result = await callRuntimeApi("/api/confirmations", {
      method: "POST",
      body: JSON.stringify({ matchId: selectedMatchId })
    });
    confirm.setLoading(false);
    if (result.ok) confirm.setSuccess("Receipt confirmed.");
    else confirm.setError(result.error);
  }

  return (
    <div className="card space-y-3">
      {historyLoading ? <p className="text-xs text-slate-500">Loading match options...</p> : null}
      {matchOptions.length === 0 ? <p data-testid="empty-matches" className="text-sm text-slate-600">No matches yet. Your future matches will appear here.</p> : null}
      <label className="block text-xs text-slate-600">Select Match
        <select data-testid="match-select" value={selectedMatchId} onChange={(e) => setMatchId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          {matchOptions.length === 0 ? <option value="">No matches available</option> : null}
          {matchOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </select>
      </label>
      <label className="block text-xs text-slate-600">Proof URL
        <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button data-testid="upload-proof" type="button" onClick={() => void uploadProof()} className="btn-muted" disabled={proof.loading || !selectedMatchId}>{proof.loading ? "Uploading..." : "Upload Proof"}</button>
        <button data-testid="confirm-receipt" type="button" onClick={() => void confirmReceipt()} className="btn-muted" disabled={confirm.loading || !selectedMatchId}>{confirm.loading ? "Confirming..." : "Confirm Receipt"}</button>
      </div>
      <ApiActionMessage success={proof.success} error={proof.error} />
      <ApiActionMessage success={confirm.success} error={confirm.error} />
    </div>
  );
}

export function DisputeActionPanel() {
  const dispute = useActionState();
  const { data, loading: historyLoading } = useMemberHistoryData();
  const [matchId, setMatchId] = useState("");
  const [reason, setReason] = useState("Payment issue");

  const disputeCandidates = useMemo(() => {
    const sent = data?.sentMatches ?? [];
    const received = data?.receivedMatches ?? [];
    const statuses = new Set(["ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION"]);
    return [...sent, ...received].filter((m) => statuses.has(m.status));
  }, [data]);

  const selectedDisputeMatchId = matchId || disputeCandidates[0]?.id || "";

  async function openDispute(e: FormEvent) {
    e.preventDefault();
    dispute.reset();
    dispute.setLoading(true);
    const result = await callRuntimeApi("/api/disputes", {
      method: "POST",
      body: JSON.stringify({ matchId: selectedDisputeMatchId, reason })
    });
    dispute.setLoading(false);
    if (result.ok) dispute.setSuccess("Dispute opened.");
    else dispute.setError(result.error);
  }

  return (
    <form className="card space-y-3" onSubmit={openDispute}>
      {historyLoading ? <p className="text-xs text-slate-500">Loading dispute candidates...</p> : null}
      {disputeCandidates.length === 0 ? <p data-testid="empty-disputes" className="text-sm text-slate-600">No disputes yet. Open disputes from active match states.</p> : null}
      <label className="block text-xs text-slate-600">Select Match
        <select data-testid="dispute-match-select" value={selectedDisputeMatchId} onChange={(e) => setMatchId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          {disputeCandidates.length === 0 ? <option value="">No eligible matches</option> : null}
          {disputeCandidates.map((m) => <option key={m.id} value={m.id}>{m.id} ({m.status})</option>)}
        </select>
      </label>
      <label className="block text-xs text-slate-600">Reason
        <textarea data-testid="dispute-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} />
      </label>
      <button data-testid="submit-dispute" type="submit" className="btn-primary" disabled={dispute.loading || !selectedDisputeMatchId}>{dispute.loading ? "Submitting..." : "Submit Dispute"}</button>
      <ApiActionMessage success={dispute.success} error={dispute.error} />
    </form>
  );
}

export function MemberHistoryPanel() {
  const history = useActionState();
  const [rows, setRows] = useState<string[]>([]);

  async function load() {
    history.reset();
    history.setLoading(true);
    const result = await callRuntimeApi<HistoryPayload>("/api/member/history", { method: "GET" });
    history.setLoading(false);
    if (result.ok) {
      const d = result.data;
      const next = [
        `offers: ${d?.contributionOffers?.length ?? 0}`,
        `requests: ${d?.recipientRequests?.length ?? 0}`,
        `sent matches: ${d?.sentMatches?.length ?? 0}`,
        `received matches: ${d?.receivedMatches?.length ?? 0}`,
        `disputes: ${d?.openedDisputes?.length ?? 0}`
      ];
      setRows(next);
      history.setSuccess("History loaded.");
    } else {
      history.setError(result.error);
    }
  }

  return (
    <div className="card space-y-3">
      <button data-testid="load-history" type="button" className="btn-primary" onClick={() => void load()} disabled={history.loading}>{history.loading ? "Loading..." : "Load My History"}</button>
      <ApiActionMessage success={history.success} error={history.error} />
      {rows.length === 0 ? <p data-testid="empty-history" className="text-sm text-slate-600">No history yet. Submit an offer or request to begin.</p> : null}
      <ul className="text-sm text-slate-700">{rows.map((r) => <li key={r}>{r}</li>)}</ul>
    </div>
  );
}
