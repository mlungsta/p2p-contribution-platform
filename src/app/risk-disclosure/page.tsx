import { SectionTitle } from "@/components/ui-shell";

export default function RiskDisclosurePage() {
  return (
    <section className="space-y-4">
      <SectionTitle title="Risk Disclosure" description="Read this before participating." />
      <div className="card text-sm text-slate-700">
        <ul className="list-disc space-y-2 pl-5">
          <li>Platform does not custody funds and does not process guaranteed returns.</li>
          <li>External payment delays, disputes, and verification timelines may occur.</li>
          <li>Proof upload is preliminary; finalization requires recipient confirmation or dispute resolution.</li>
          <li>System safe mode may delay batch matching to preserve operational safety.</li>
        </ul>
      </div>
    </section>
  );
}
