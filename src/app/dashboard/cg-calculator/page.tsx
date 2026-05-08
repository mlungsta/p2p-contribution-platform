"use client";

import { useMemo, useState } from "react";
import { SectionTitle } from "@/components/ui-shell";

function toMinor(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : 0;
}

function toRate(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toDays(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : 0;
}

export default function CgCalculatorPage() {
  const [contributionMinor, setContributionMinor] = useState("10000");
  const [dailyPercent, setDailyPercent] = useState("0.05");
  const [days, setDays] = useState("30");

  const projection = useMemo(() => {
    const amountMinor = toMinor(contributionMinor);
    const rate = toRate(dailyPercent) / 100;
    const maturityDays = toDays(days);
    const projectedCgMinor = Math.round(amountMinor * rate * maturityDays);
    const projectedTotalMinor = amountMinor + projectedCgMinor;
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + maturityDays);

    return { amountMinor, projectedCgMinor, projectedTotalMinor, maturityDate: maturityDate.toISOString().slice(0, 10) };
  }, [contributionMinor, dailyPercent, days]);

  return (
    <section className="space-y-4">
      <SectionTitle title="Projected Capital + Gratitude Calculator" description="Informational estimate only." />
      <div className="card grid gap-3 md:grid-cols-3">
        <label className="text-xs text-slate-600">Contribution amount (minor units)
          <input data-testid="cg-contribution-minor" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={contributionMinor} onChange={(e) => setContributionMinor(e.target.value)} />
        </label>
        <label className="text-xs text-slate-600">Daily projected gratitude %
          <input data-testid="cg-daily-percent" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={dailyPercent} onChange={(e) => setDailyPercent(e.target.value)} />
        </label>
        <label className="text-xs text-slate-600">Days
          <input data-testid="cg-days" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <div className="card space-y-2 text-sm text-slate-700">
        <p data-testid="cg-projected-cg">Projected gratitude (minor): <span className="font-semibold">{projection.projectedCgMinor}</span></p>
        <p data-testid="cg-projected-total">Projected total (minor): <span className="font-semibold">{projection.projectedTotalMinor}</span></p>
        <p data-testid="cg-projected-maturity">Projected maturity date: <span className="font-semibold">{projection.maturityDate}</span></p>
        <p className="text-xs text-amber-700">Disclaimer: estimate only, not guaranteed. This calculator does not trigger payout, matching, or ledger entries.</p>
      </div>
    </section>
  );
}
