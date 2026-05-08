import Link from "next/link";
import { MetricCard, SafeModeBanner, SectionTitle, StatusBadge } from "@/components/ui-shell";
import { requireMemberRouteAccess } from "@/lib/route-guards";

export default async function DashboardPage() {
  const role = await requireMemberRouteAccess();

  return (
    <section className="space-y-6">
      <SectionTitle title="Member Dashboard" description="Create contribution intents, monitor matches, and track your history." />
      <SafeModeBanner enabled={false} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Contributions made" value="0" />
        <MetricCard label="Contributions received" value="0" />
        <MetricCard label="Pending matches" value="0" />
      </div>
      <div className="card flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Account status:</span>
        <StatusBadge status="APPROVED" />
        <span className="ml-auto text-xs text-slate-500">Role: {role}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/dashboard/contributions" className="btn-primary">Create Offer / Request</Link>
        <Link href="/dashboard/matches" className="btn-muted">My Matches</Link>
        <Link href="/dashboard/disputes" className="btn-muted">Open Dispute Placeholder</Link>
        <Link href="/dashboard/history" className="btn-muted">My History</Link>
      </div>
    </section>
  );
}

