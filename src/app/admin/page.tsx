import Link from "next/link";
import { redirect } from "next/navigation";
import { MetricCard, SafeModeBanner, SectionTitle } from "@/components/ui-shell";
import { hasPermission } from "@/lib/permissions";
import { requireAuthenticatedSession } from "@/lib/route-guards";
import { AdminDataViewsPanel, ForceLogoutPanel, MemberManagementPanel, SafeModePanel } from "@/components/admin-actions";
import { db } from "@/lib/db";

export default async function AdminPage() {
  const session = await requireAuthenticatedSession();
  const role = session.actorRole;
  if (role !== "OPS_ADMIN" && role !== "SUPER_ADMIN" && role !== "COMPLIANCE_REVIEWER" && role !== "SUPPORT") {
    redirect("/auth");
  }

  const canOperate = hasPermission(role, "match:review") || hasPermission(role, "dispute:review");
  const canOverride = hasPermission(role, "matching:override");
  const canAudit = hasPermission(role, "audit:view");
  const canManageMembers = role === "OPS_ADMIN" || role === "SUPER_ADMIN";
  const canForceLogout = role === "SUPER_ADMIN";

  const [memberCount, activeOffers, activeRequests, activeMatches, openDisputes, safeModeSetting] = await Promise.all([
    db.user.count({ where: { role: "MEMBER" } }),
    db.contributionOffer.count({ where: { status: { in: ["ACTIVE", "WAITING_FOR_POOL", "MATCHED"] } } }),
    db.recipientRequest.count({ where: { status: { in: ["ACTIVE", "PARTIALLY_MATCHED", "WAITING_FOR_POOL"] } } }),
    db.match.count({ where: { status: { in: ["ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION", "DISPUTED"] } } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "EVIDENCE_REQUIRED", "UNDER_REVIEW"] } } }),
    db.systemSetting.findUnique({ where: { key: "SAFE_MODE" }, select: { value: true } })
  ]);

  const safeModeEnabled = Boolean((safeModeSetting?.value as { enabled?: boolean } | null)?.enabled);

  return (
    <section className="space-y-6">
      <SectionTitle title="Admin Dashboard" description="Operational overview and controlled actions." />
      <SafeModeBanner enabled={safeModeEnabled} />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Members" value={String(memberCount)} />
        <MetricCard label="Active offers" value={String(activeOffers)} />
        <MetricCard label="Active requests" value={String(activeRequests)} />
        <MetricCard label="Active matches" value={String(activeMatches)} />
        <MetricCard label="Open disputes" value={String(openDisputes)} />
        <MetricCard label="Safe mode" value={safeModeEnabled ? "ON" : "OFF"} />
      </div>
      <div className="card space-y-3 text-sm">
        <p className="text-slate-700">Role: <span className="font-semibold">{role}</span></p>
        <p data-testid="admin-safe-mode-state" className="text-xs text-slate-600">Safe mode state: {safeModeEnabled ? "ON" : "OFF"}</p>
        <div className="flex flex-wrap gap-2">
          {canOperate ? <Link href="/admin/matches" className="btn-primary">Matching Queue</Link> : null}
          {canOperate ? <Link href="/admin/disputes" className="btn-muted">Disputes</Link> : null}
          {canAudit ? <Link href="/admin/audit-logs" className="btn-muted">Audit Logs</Link> : null}
          {canOverride ? <span className="btn-muted">Override Available</span> : null}
        </div>
      </div>
      <SafeModePanel />
      <AdminDataViewsPanel />
      {canManageMembers ? <MemberManagementPanel /> : null}
      {canForceLogout ? <ForceLogoutPanel /> : null}
    </section>
  );
}
