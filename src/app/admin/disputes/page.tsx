import { SectionTitle } from "@/components/ui-shell";
import { hasPermission } from "@/lib/permissions";
import { requireAdminRouteAccess } from "@/lib/route-guards";
import { ResolveDisputePanel } from "@/components/admin-actions";

export default async function AdminDisputesPage() {
  const role = await requireAdminRouteAccess();
  const canResolve = hasPermission(role, "dispute:review") && role !== "COMPLIANCE_REVIEWER";

  return (
    <section className="space-y-4">
      <SectionTitle title="Disputes" description="Resolve disputes with required notes and full audit trail." />
      {canResolve ? <ResolveDisputePanel /> : <p className="text-sm text-amber-700">Read-only role cannot resolve disputes.</p>}
    </section>
  );
}
