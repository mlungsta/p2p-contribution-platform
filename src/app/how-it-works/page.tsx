import { SectionTitle } from "@/components/ui-shell";

export default function HowItWorksPage() {
  return (
    <section className="space-y-4">
      <SectionTitle title="How It Works" description="Batch-based coordination flow for member-to-member contributions." />
      <ol className="card list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Member creates a contribution offer or recipient request.</li>
        <li>System queues records for batch matching.</li>
        <li>Match is assigned with clear status transitions.</li>
        <li>Payer uploads proof metadata after external transfer.</li>
        <li>Recipient confirms, or dispute workflow is opened.</li>
      </ol>
    </section>
  );
}
