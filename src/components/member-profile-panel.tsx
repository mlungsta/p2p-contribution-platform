"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiActionMessage, callRuntimeApi, useActionState } from "@/components/runtime-api-client";

type ProfilePayload = {
  displayName: string;
  countryCode?: string | null;
  timezone?: string | null;
};

export function MemberProfilePanel() {
  const state = useActionState();
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("ZA");
  const [timezone, setTimezone] = useState("Africa/Johannesburg");

  useEffect(() => {
    let active = true;
    async function load() {
      const result = await callRuntimeApi<ProfilePayload | null>("/api/member/profile", { method: "GET" });
      if (active && result.ok && result.data) {
        setDisplayName(result.data.displayName ?? "");
        setCountryCode(result.data.countryCode ?? "");
        setTimezone(result.data.timezone ?? "");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    state.reset();
    state.setLoading(true);
    const result = await callRuntimeApi("/api/member/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName, countryCode, timezone })
    });
    state.setLoading(false);
    if (result.ok) state.setSuccess("Profile saved.");
    else state.setError(result.error);
  }

  return (
    <form className="card space-y-3" onSubmit={submit}>
      <label className="block text-xs text-slate-600">Display Name
        <input data-testid="profile-display-name" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} />
      </label>
      <label className="block text-xs text-slate-600">Country Code
        <input data-testid="profile-country" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} />
      </label>
      <label className="block text-xs text-slate-600">Timezone
        <input data-testid="profile-timezone" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </label>
      <button data-testid="profile-save" type="submit" className="btn-primary" disabled={state.loading}>{state.loading ? "Saving..." : "Save Profile"}</button>
      <ApiActionMessage success={state.success} error={state.error} />
    </form>
  );
}
