import Link from "next/link";
import { MetricCard, SafeModeBanner, SectionTitle } from "@/components/ui-shell";
import { hasPermission } from "@/lib/permissions";
import { requireAdminRouteAccess } from "@/lib/route-guards";
import { SafeModePanel } from "@/components/admin-actions";

export default async function AdminPage() {
  const role = await requireAdminRouteAccess();
  const canOperate = hasPermission(role, "match:review") || hasPermission(role, "dispute:review");
  const canOverride = hasPermission(role, "matching:override");
  const canAudit = hasPermission(role, "audit:view");

  return (
    <section className="space-y-6">
      <SectionTitle title="Admin Dashboard" description="Operational overview and controlled actions." />
      <SafeModeBanner enabled={false} />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Pending matches" value="0" />
        <MetricCard label="Open disputes" value="0" />
        <MetricCard label="Proof pending" value="0" />
        <MetricCard label="System status" value="Normal" />
      </div>
      <div className="card space-y-3 text-sm">
        <p className="text-slate-700">Role: <span className="font-semibold">{role}</span></p>
        <div className="flex flex-wrap gap-2">
          {canOperate ? <Link href="/admin/matches" className="btn-primary">Matching Queue</Link> : null}
          {canOperate ? <Link href="/admin/disputes" className="btn-muted">Disputes</Link> : null}
          {canAudit ? <Link href="/admin/audit-logs" className="btn-muted">Audit Logs</Link> : null}
          {canOverride ? <span className="btn-muted">Override Available</span> : null}
        </div>
      </div>
      <SafeModePanel />
    </section>
  );
}
