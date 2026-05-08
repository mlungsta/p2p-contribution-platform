import { SectionTitle, StatusBadge } from "@/components/ui-shell";
import { hasPermission } from "@/lib/permissions";
import { requireAdminRouteAccess } from "@/lib/route-guards";
import { OverridePanel, RunBatchPanel } from "@/components/admin-actions";

export default async function AdminMatchesPage() {
  const role = await requireAdminRouteAccess();
  const canRun = hasPermission(role, "match:review");
  const canOverride = hasPermission(role, "matching:override");

  return (
    <section className="space-y-4">
      <SectionTitle title="Matching Queue" description="Run matching batches and perform controlled overrides." />
      <div className="card text-sm text-slate-700">
        <p>Queue state: <StatusBadge status="WAITING_FOR_POOL" /></p>
      </div>
      {canRun ? <RunBatchPanel /> : <p className="text-sm text-amber-700">Read-only role cannot run matching.</p>}
      {canOverride ? <OverridePanel /> : <p className="text-sm text-amber-700">Override requires SUPER_ADMIN.</p>}
    </section>
  );
}
