"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse = {
  ok: boolean;
  data?: { role: string; redirectPath: string };
  error?: { code?: string; message?: string };
};

function userFacingLoginError(code?: string, message?: string): string {
  if (code === "UNAUTHORIZED") return "Invalid email or password.";
  if (code === "FORBIDDEN") return message ?? "Login currently not allowed for this account.";
  if (code === "VALIDATION_ERROR") return "Please provide a valid email and password.";
  return message ?? "Login failed. Please try again.";
}

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const json = (await res.json().catch(() => null)) as LoginResponse | null;
    if (json?.ok && json.data?.redirectPath) {
      setMessage("Login successful.");
      router.push(json.data.redirectPath);
      return;
    }

    setMessage(userFacingLoginError(json?.error?.code, json?.error?.message));
  }

  async function register() {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName })
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setMessage("Registration submitted. Account status is pending review.");
    } else {
      setMessage(json?.error?.message ?? "Registration failed.");
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMessage("Session cleared.");
    router.push("/auth");
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Authentication</h1>
      <p className="text-sm text-slate-600">Sign in or register a member account.</p>
      <form onSubmit={signIn} className="card space-y-3 max-w-md">
        <input data-testid="auth-email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="email" type="email" required />
        <input data-testid="auth-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="password" type="password" required minLength={8} />
        <input data-testid="auth-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="display name (for registration)" />
        <div className="flex flex-wrap gap-2">
          <button data-testid="auth-sign-in" type="submit" className="btn-primary">Sign In</button>
          <button data-testid="auth-register" type="button" className="btn-muted" onClick={() => void register()}>Register</button>
          <button data-testid="auth-sign-out" type="button" className="btn-muted" onClick={() => void signOut()}>Sign Out</button>
        </div>
      </form>
      {message ? <p data-testid="session-message" className="text-sm text-slate-700">{message}</p> : null}
    </section>
  );
}
