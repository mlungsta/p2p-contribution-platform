import { SectionTitle } from "@/components/ui-shell";

export default function FaqPage() {
  return (
    <section className="space-y-4">
      <SectionTitle title="FAQ" description="Common questions about contribution coordination." />
      <div className="space-y-3 text-sm text-slate-700">
        <div className="card"><p className="font-medium">Do you hold my funds?</p><p>No. Payments happen externally between matched members.</p></div>
        <div className="card"><p className="font-medium">Is proof upload final confirmation?</p><p>No. Recipient confirmation or dispute resolution is required.</p></div>
        <div className="card"><p className="font-medium">Can admins silently alter records?</p><p>No. Financial history is immutable and admin actions are audited.</p></div>
      </div>
    </section>
  );
}
