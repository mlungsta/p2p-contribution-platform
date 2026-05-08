"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const api_route_1 = require("@/lib/api-route");
const session_auth_1 = require("@/lib/session-auth");
async function GET(req) {
    const correlationId = (0, session_auth_1.getCorrelationId)(req);
    const limited = await (0, api_route_1.enforceRateLimit)(req, "public", correlationId);
    if (limited)
        return limited;
    return server_1.NextResponse.json({ status: "ok", correlationId });
}
