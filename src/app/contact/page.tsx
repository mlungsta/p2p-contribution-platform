import { SectionTitle } from "@/components/ui-shell";

export default function ContactPage() {
  return (
    <section className="space-y-4">
      <SectionTitle title="Contact" description="Operational support and compliance contacts." />
      <div className="card space-y-2 text-sm text-slate-700">
        <p>Support: support@p2p-platform.local</p>
        <p>Compliance: compliance@p2p-platform.local</p>
        <p>Include your correlation ID when reporting an issue.</p>
      </div>
    </section>
  );
}
