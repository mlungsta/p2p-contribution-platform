import { SectionTitle } from "@/components/ui-shell";
import { requireRoutePermission } from "@/lib/route-guards";
import { AuditLogPanel } from "@/components/admin-actions";

export default async function AdminAuditLogsPage() {
  await requireRoutePermission("audit:view");

  return (
    <section className="space-y-4">
      <SectionTitle title="Audit Log Viewer" description="Read-only audit visibility for authorized roles." />
      <AuditLogPanel />
    </section>
  );
}
