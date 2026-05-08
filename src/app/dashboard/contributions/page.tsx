import { SectionTitle, StatusBadge } from "@/components/ui-shell";
import { requireMemberRouteAccess } from "@/lib/route-guards";
import { ContributionActionsPanel } from "@/components/member-actions";

export default async function ContributionsPage() {
  await requireMemberRouteAccess();

  return (
    <section className="space-y-6">
      <SectionTitle title="Create Contribution Intent" description="Submit contribution offers and recipient requests." />
      <ContributionActionsPanel />
      <p className="text-xs text-slate-500">New offers may enter <StatusBadge status="WAITING_FOR_POOL" /> during safe mode.</p>
    </section>
  );
}
