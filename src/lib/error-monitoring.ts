import { structuredLogger } from "./logger";

export interface ErrorMonitoringContext {
  correlationId: string;
  actorId?: string;
  action: string;
  tags?: Record<string, string>;
}

export interface ErrorMonitoringProvider {
  capture(error: unknown, context: ErrorMonitoringContext): void;
}

class NoopMonitoringProvider implements ErrorMonitoringProvider {
  capture(error: unknown, context: ErrorMonitoringContext): void {
    structuredLogger.error("captured_error", {
      correlationId: context.correlationId,
      actorId: context.actorId,
      action: context.action,
      details: {
        provider: "noop",
        error_class: error instanceof Error ? error.name : "unknown",
        ...context.tags
      }
    });
  }
}

let monitoringProvider: ErrorMonitoringProvider = new NoopMonitoringProvider();

class HttpErrorMonitoringProvider implements ErrorMonitoringProvider {
  constructor(private readonly endpoint: string, private readonly token?: string) {}

  capture(error: unknown, context: ErrorMonitoringContext): void {
    const payload = {
      message: error instanceof Error ? error.message : "unknown_error",
      error_class: error instanceof Error ? error.name : "unknown",
      stack: error instanceof Error ? error.stack : undefined,
      correlation_id: context.correlationId,
      actor_id: context.actorId,
      action: context.action,
      tags: context.tags,
      timestamp: new Date().toISOString()
    };

    void fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Never throw from monitoring path.
    });
  }
}

if (process.env.ERROR_MONITORING_URL) {
  monitoringProvider = new HttpErrorMonitoringProvider(
    process.env.ERROR_MONITORING_URL,
    process.env.ERROR_MONITORING_TOKEN
  );
}

export function setErrorMonitoringProvider(provider: ErrorMonitoringProvider): void {
  monitoringProvider = provider;
}

export function captureError(error: unknown, context: ErrorMonitoringContext): void {
  try {
    monitoringProvider.capture(error, context);
  } catch {
    // Never let monitoring failures break runtime paths.
  }
}
