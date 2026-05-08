export interface StructuredLogProviderPayload {
  level: StructuredLogLevel;
  message: string;
  correlation_id: string;
  actor_id?: string;
  action: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export type StructuredLogLevel = "info" | "warn" | "error";

export interface StructuredLogContext {
  correlationId: string;
  actorId?: string;
  action: string;
  details?: Record<string, unknown>;
}

export interface StructuredLogProvider {
  write(payload: StructuredLogProviderPayload): void;
}

class StdoutJsonProvider implements StructuredLogProvider {
  write(payload: StructuredLogProviderPayload): void {
    const line = JSON.stringify(payload);
    if (payload.level === "error") {
      console.error(line);
      return;
    }
    if (payload.level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}

class HttpJsonProvider implements StructuredLogProvider {
  constructor(private readonly endpoint: string, private readonly token?: string) {}

  write(payload: StructuredLogProviderPayload): void {
    void fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Fallback path intentionally silent to avoid recursive logging loops.
    });
  }
}

let provider: StructuredLogProvider = new StdoutJsonProvider();

const externalLogEndpoint = process.env.LOG_PROVIDER_URL;
if (externalLogEndpoint) {
  provider = new HttpJsonProvider(externalLogEndpoint, process.env.LOG_PROVIDER_TOKEN);
}

export function setStructuredLogProvider(nextProvider: StructuredLogProvider): void {
  provider = nextProvider;
}

function emit(level: StructuredLogLevel, message: string, context: StructuredLogContext) {
  provider.write({
    level,
    message,
    correlation_id: context.correlationId,
    actor_id: context.actorId,
    action: context.action,
    details: context.details,
    timestamp: new Date().toISOString()
  });
}

export const structuredLogger = {
  info: (message: string, context: StructuredLogContext) => emit("info", message, context),
  warn: (message: string, context: StructuredLogContext) => emit("warn", message, context),
  error: (message: string, context: StructuredLogContext) => emit("error", message, context)
};
