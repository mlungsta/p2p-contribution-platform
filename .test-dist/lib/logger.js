"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.structuredLogger = void 0;
exports.setStructuredLogProvider = setStructuredLogProvider;
class StdoutJsonProvider {
    write(payload) {
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
class HttpJsonProvider {
    endpoint;
    token;
    constructor(endpoint, token) {
        this.endpoint = endpoint;
        this.token = token;
    }
    write(payload) {
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
let provider = new StdoutJsonProvider();
const externalLogEndpoint = process.env.LOG_PROVIDER_URL;
if (externalLogEndpoint) {
    provider = new HttpJsonProvider(externalLogEndpoint, process.env.LOG_PROVIDER_TOKEN);
}
function setStructuredLogProvider(nextProvider) {
    provider = nextProvider;
}
function emit(level, message, context) {
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
exports.structuredLogger = {
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, context) => emit("error", message, context)
};
