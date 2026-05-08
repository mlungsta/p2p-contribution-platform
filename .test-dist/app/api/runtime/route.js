"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const db_1 = require("@/lib/db");
const runtime_api_service_1 = require("@/server/services/runtime-api-service");
const permissions_1 = require("@/lib/permissions");
async function POST(req) {
    const body = await req.json();
    const action = body?.action;
    const roleRaw = req.headers.get("x-user-role") ?? body?.context?.actorRole;
    const actorRole = permissions_1.appRoleSchema.parse(roleRaw);
    const context = {
        actorUserId: req.headers.get("x-user-id") ?? body?.context?.actorUserId,
        actorRole,
        correlationId: req.headers.get("x-correlation-id") ?? body?.context?.correlationId,
        triggerSource: body?.context?.triggerSource ?? "api",
        batchRunId: body?.context?.batchRunId
    };
    const service = new runtime_api_service_1.RuntimeApiService(db_1.db);
    const run = async () => {
        switch (action) {
            case "createContributionOffer":
                return service.createContributionOffer(context, body.payload);
            case "createRecipientRequest":
                return service.createRecipientRequest(context, body.payload);
            case "runBatchMatching":
                return service.runBatchMatching(context, body.payload);
            case "uploadProofMetadata":
                return service.uploadProofMetadata(context, body.payload);
            case "confirmReceipt":
                return service.confirmReceipt(context, body.payload);
            case "openDispute":
                return service.openDispute(context, body.payload);
            case "resolveDispute":
                return service.resolveDispute(context, body.payload);
            case "viewMemberStatusHistory":
                return service.viewMemberStatusHistory(context);
            case "adminOverride":
                return service.adminOverride(context, body.payload);
            default:
                throw new Error("Unknown action");
        }
    };
    const result = await (0, runtime_api_service_1.executeWithErrorHandling)(runtime_api_service_1.RuntimeApiService.parseContext(context), run);
    const status = result.ok ? 200 : result.error.code === "FORBIDDEN" ? 403 : result.error.code === "NOT_FOUND" ? 404 : result.error.code === "INTERNAL_ERROR" ? 500 : 400;
    return server_1.NextResponse.json(result, { status });
}
