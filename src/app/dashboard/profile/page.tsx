import { SectionTitle } from "@/components/ui-shell";
import { requireMemberRouteAccess } from "@/lib/route-guards";
import { MemberProfilePanel } from "@/components/member-profile-panel";

export default async function MemberProfilePage() {
  await requireMemberRouteAccess();

  return (
    <section className="space-y-4">
      <SectionTitle title="Member Profile" description="Complete your profile to speed up review and operations handling." />
      <MemberProfilePanel />
    </section>
  );
}
