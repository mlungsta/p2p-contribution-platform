"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setErrorMonitoringProvider = setErrorMonitoringProvider;
exports.captureError = captureError;
const logger_1 = require("./logger");
class NoopMonitoringProvider {
    capture(error, context) {
        logger_1.structuredLogger.error("captured_error", {
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
let monitoringProvider = new NoopMonitoringProvider();
class HttpErrorMonitoringProvider {
    endpoint;
    token;
    constructor(endpoint, token) {
        this.endpoint = endpoint;
        this.token = token;
    }
    capture(error, context) {
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
    monitoringProvider = new HttpErrorMonitoringProvider(process.env.ERROR_MONITORING_URL, process.env.ERROR_MONITORING_TOKEN);
}
function setErrorMonitoringProvider(provider) {
    monitoringProvider = provider;
}
function captureError(error, context) {
    try {
        monitoringProvider.capture(error, context);
    }
    catch {
        // Never let monitoring failures break runtime paths.
    }
}
