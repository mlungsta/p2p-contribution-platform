"use client";

import { FormEvent, useState } from "react";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setMessage("Login successful. Session active.");
    } else {
      setMessage(json?.error?.message ?? "Login failed.");
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMessage("Session cleared.");
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Authentication</h1>
      <p className="text-sm text-slate-600">Sign in using your account credentials.</p>
      <form onSubmit={signIn} className="card space-y-3 max-w-md">
        <input data-testid="auth-email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="email" type="email" required />
        <input data-testid="auth-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="password" type="password" required minLength={8} />
        <div className="flex gap-2">
          <button data-testid="auth-sign-in" type="submit" className="btn-primary">Sign In</button>
          <button data-testid="auth-sign-out" type="button" className="btn-muted" onClick={() => void signOut()}>Sign Out</button>
        </div>
      </form>
      {message ? <p data-testid="session-message" className="text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
