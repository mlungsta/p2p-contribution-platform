import { SectionTitle } from "@/components/ui-shell";
import { requireMemberRouteAccess } from "@/lib/route-guards";
import { DisputeActionPanel } from "@/components/member-actions";

export default async function DisputesPage() {
  await requireMemberRouteAccess();

  return (
    <section className="space-y-4">
      <SectionTitle title="Open Dispute" description="Submit dispute details for operational review." />
      <DisputeActionPanel />
    </section>
  );
}
