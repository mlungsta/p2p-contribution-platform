"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
exports.PATCH = PATCH;
const server_1 = require("next/server");
const db_1 = require("@/lib/db");
const route_auth_1 = require("@/lib/route-auth");
const session_auth_1 = require("@/lib/session-auth");
const runtime_api_service_1 = require("@/server/services/runtime-api-service");
const api_route_1 = require("@/lib/api-route");
const step_up_policy_1 = require("@/lib/step-up-policy");
async function GET(req) {
    const fallbackCorrelationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "admin", fallbackCorrelationId);
    if (limited)
        return limited;
    try {
        const ctx = await (0, route_auth_1.buildRouteContext)(req, db_1.db, "api:admin:safe-mode:get");
        const service = new runtime_api_service_1.RuntimeApiService(db_1.db);
        const result = await (0, runtime_api_service_1.executeWithErrorHandling)(ctx, () => service.getSafeMode(ctx));
        return server_1.NextResponse.json(result, { status: (0, api_route_1.mapApiResultStatus)(result) });
    }
    catch (error) {
        return (0, route_auth_1.routeErrorResponse)(error, fallbackCorrelationId);
    }
}
async function PATCH(req) {
    const fallbackCorrelationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "admin", fallbackCorrelationId);
    if (limited)
        return limited;
    try {
        const payload = await req.json();
        (0, step_up_policy_1.requireStepUpForSensitiveAction)(req);
        const ctx = await (0, route_auth_1.buildRouteContext)(req, db_1.db, "api:admin:safe-mode:set");
        const service = new runtime_api_service_1.RuntimeApiService(db_1.db);
        const result = await (0, runtime_api_service_1.executeWithErrorHandling)(ctx, () => service.setSafeMode(ctx, payload));
        return server_1.NextResponse.json(result, { status: (0, api_route_1.mapApiResultStatus)(result) });
    }
    catch (error) {
        return (0, route_auth_1.routeErrorResponse)(error, fallbackCorrelationId);
    }
}
