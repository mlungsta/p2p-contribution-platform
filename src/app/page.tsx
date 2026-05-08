import Link from "next/link";
import { MetricCard, SectionTitle, SafeModeBanner, StatusBadge } from "@/components/ui-shell";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <SectionTitle
        title="Peer-to-Peer Contribution Coordination"
        description="Coordinate contributions, recipient requests, proof review, and dispute handling with transparent status tracking."
      />
      <SafeModeBanner enabled={false} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Contributions made" value="--" />
        <MetricCard label="Contributions received" value="--" />
        <MetricCard label="Pending matches" value="--" />
      </div>
      <div className="card space-y-3">
        <p className="text-sm text-slate-700">
          This platform coordinates external payments between members. Proof upload does not equal confirmation, and disputes are resolved through explicit review.
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="WAITING_FOR_POOL" />
          <StatusBadge status="AWAITING_PAYMENT" />
          <StatusBadge status="DISPUTED" />
          <StatusBadge status="CONFIRMED" />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className="btn-primary">Go to Member Dashboard</Link>
        <Link href="/admin" className="btn-muted">Go to Admin Dashboard</Link>
      </div>
    </section>
  );
}
