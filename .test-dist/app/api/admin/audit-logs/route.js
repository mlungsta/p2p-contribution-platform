"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const db_1 = require("@/lib/db");
const route_auth_1 = require("@/lib/route-auth");
const session_auth_1 = require("@/lib/session-auth");
const runtime_api_service_1 = require("@/server/services/runtime-api-service");
const api_route_1 = require("@/lib/api-route");
async function GET(req) {
    const fallbackCorrelationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "admin", fallbackCorrelationId);
    if (limited)
        return limited;
    try {
        const ctx = await (0, route_auth_1.buildRouteContext)(req, db_1.db, "api:admin:audit-logs");
        const service = new runtime_api_service_1.RuntimeApiService(db_1.db);
        const result = await (0, runtime_api_service_1.executeWithErrorHandling)(ctx, () => service.viewAuditLogs(ctx));
        return server_1.NextResponse.json(result, { status: (0, api_route_1.mapApiResultStatus)(result) });
    }
    catch (error) {
        return (0, route_auth_1.routeErrorResponse)(error, fallbackCorrelationId);
    }
}
