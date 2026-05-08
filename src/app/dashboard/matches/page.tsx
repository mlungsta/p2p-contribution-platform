import { SectionTitle, StatusBadge } from "@/components/ui-shell";
import { requireMemberRouteAccess } from "@/lib/route-guards";
import { MatchActionsPanel } from "@/components/member-actions";

export default async function MatchesPage() {
  await requireMemberRouteAccess();

  return (
    <section className="space-y-6">
      <SectionTitle title="My Matches" description="Track assignment, proof, and confirmation actions." />
      <div className="card text-sm text-slate-700">
        <p>Current status example: <StatusBadge status="AWAITING_PAYMENT" /></p>
      </div>
      <MatchActionsPanel />
    </section>
  );
}
