import { SectionTitle } from "@/components/ui-shell";
import { requireMemberRouteAccess } from "@/lib/route-guards";
import { MemberHistoryPanel } from "@/components/member-actions";

export default async function MemberHistoryPage() {
  await requireMemberRouteAccess();

  return (
    <section className="space-y-4">
      <SectionTitle title="My History" description="Load contributions, requests, matches, and disputes history." />
      <MemberHistoryPanel />
    </section>
  );
}
