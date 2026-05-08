import Link from "next/link";
import { ReactNode } from "react";
import { statusTone } from "@/lib/ui-shell";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-300 bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link data-testid="nav-home" href="/" className="text-sm font-semibold tracking-wide">P2P Contribution Platform</Link>
          <nav className="flex flex-wrap gap-3 text-xs text-slate-200">
            <Link data-testid="nav-how-it-works" href="/how-it-works">How It Works</Link>
            <Link data-testid="nav-risk-disclosure" href="/risk-disclosure">Risk Disclosure</Link>
            <Link data-testid="nav-faq" href="/faq">FAQ</Link>
            <Link data-testid="nav-contact" href="/contact">Contact</Link>
            <Link data-testid="nav-member" href="/dashboard">Member</Link>
            <Link data-testid="nav-admin" href="/admin">Admin</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {description ? <p className="text-sm text-slate-600">{description}</p> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    positive: "bg-emerald-100 text-emerald-800 border-emerald-300",
    warning: "bg-amber-100 text-amber-800 border-amber-300",
    danger: "bg-red-100 text-red-800 border-red-300",
    neutral: "bg-slate-100 text-slate-700 border-slate-300"
  };
  const tone = statusTone(status);

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${classes[tone]}`}>{status}</span>;
}

export function SafeModeBanner({ enabled }: { enabled: boolean }) {
  return (
    <div className={`card border-l-4 ${enabled ? "border-l-amber-500" : "border-l-emerald-600"}`}>
      <p className={`text-sm ${enabled ? "text-amber-800" : "text-emerald-800"}`}>
        {enabled
          ? "Safe mode active: matching and override actions are restricted while risk controls are prioritized."
          : "Safe mode inactive: normal batch operations are available."}
      </p>
    </div>
  );
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
