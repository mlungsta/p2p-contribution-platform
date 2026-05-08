"use client";

import { useState } from "react";

export interface UiApiError {
  code: string;
  message: string;
  correlationId: string;
}

export function humanizeApiError(code: string): string {
  if (code === "VALIDATION_ERROR") return "Please check the input values and try again.";
  if (code === "FORBIDDEN") return "You do not have permission for this action.";
  if (code === "NOT_FOUND") return "The requested record was not found.";
  if (code === "INVALID_STATE") return "This action is not allowed from the current state.";
  if (code === "SAFE_MODE_BLOCKED") return "Action blocked while safe mode is active.";
  if (code === "CONSTRAINT_VIOLATION") return "Operation could not be completed due to data constraints.";
  return "Unexpected internal error. Please contact support with the correlation ID.";
}

export function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `corr_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

export async function callRuntimeApi<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: UiApiError }> {
  const correlationId = generateCorrelationId();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-correlation-id": correlationId,
      ...(init.headers ?? {})
    }
  });

  const payload = await res.json().catch(() => null);
  if (payload?.ok === true) {
    return { ok: true, data: payload.data as T };
  }

  return {
    ok: false,
    error: {
      code: payload?.error?.code ?? "INTERNAL_ERROR",
      message: payload?.error?.message ?? "Unexpected internal error",
      correlationId: payload?.error?.correlationId ?? correlationId
    }
  };
}

export function ApiActionMessage({ success, error }: { success: string | null; error: UiApiError | null }) {
  if (success) return <p role="status" data-testid="action-success" className="text-sm text-emerald-700">{success}</p>;
  if (error) {
    return <p role="alert" data-testid="action-error" className="text-sm text-red-700">{humanizeApiError(error.code)} Correlation ID: {error.correlationId}</p>;
  }
  return null;
}

export function useActionState() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<UiApiError | null>(null);

  return {
    loading,
    success,
    error,
    setLoading,
    setSuccess,
    setError,
    reset: () => {
      setSuccess(null);
      setError(null);
    }
  };
}
