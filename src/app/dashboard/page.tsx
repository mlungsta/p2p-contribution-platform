import Link from "next/link";
import { redirect } from "next/navigation";
import { MatchStatus } from "@prisma/client";
import { MetricCard, SafeModeBanner, SectionTitle, StatusBadge } from "@/components/ui-shell";
import { db } from "@/lib/db";
import { requireAuthenticatedSession } from "@/lib/route-guards";

const pendingStatuses: MatchStatus[] = ["ASSIGNED", "AWAITING_PAYMENT", "PROOF_UPLOADED", "AWAITING_CONFIRMATION", "DISPUTED"];

export default async function DashboardPage() {
  const session = await requireAuthenticatedSession();
  if (session.actorRole !== "MEMBER") {
    redirect("/auth");
  }

  const [contributionsMade, contributionsReceived, pendingMatches, user] = await Promise.all([
    db.match.count({ where: { senderUserId: session.actorUserId, status: "CONFIRMED" } }),
    db.match.count({ where: { recipientUserId: session.actorUserId, status: "CONFIRMED" } }),
    db.match.count({
      where: {
        OR: [{ senderUserId: session.actorUserId }, { recipientUserId: session.actorUserId }],
        status: { in: pendingStatuses }
      }
    }),
    db.user.findUnique({ where: { id: session.actorUserId }, select: { memberStatus: true } })
  ]);

  return (
    <section className="space-y-6">
      <SectionTitle title="Member Dashboard" description="Create contribution intents, monitor matches, and track your history." />
      <SafeModeBanner enabled={false} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Contributions made" value={String(contributionsMade)} />
        <MetricCard label="Contributions received" value={String(contributionsReceived)} />
        <MetricCard label="Pending matches" value={String(pendingMatches)} />
      </div>
      <div className="card flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Account status:</span>
        <StatusBadge status={user?.memberStatus ?? "PENDING_REVIEW"} />
        <span className="ml-auto text-xs text-slate-500">Role: {session.actorRole}</span>
      </div>
      <div className="card text-sm text-slate-700">
        <p className="font-medium">Status guide</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
          <li><span className="font-semibold">WAITING_FOR_POOL</span>: queued until the next eligible batch cycle.</li>
          <li><span className="font-semibold">AWAITING_PAYMENT</span>: make payment externally and upload proof metadata.</li>
          <li><span className="font-semibold">PROOF_UPLOADED</span>: awaiting recipient confirmation or dispute review.</li>
        </ul>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/dashboard/profile" className="btn-muted">Complete Profile</Link>
        <Link href="/dashboard/contributions" className="btn-primary">Create Offer / Request</Link>
        <Link href="/dashboard/matches" className="btn-muted">My Matches</Link>
        <Link href="/dashboard/disputes" className="btn-muted">Open Dispute</Link>
        <Link href="/dashboard/history" className="btn-muted">My History</Link>
        <Link href="/dashboard/cg-calculator" className="btn-muted">Projected CG Calculator (Estimate)</Link>
      </div>
    </section>
  );
}
