"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireStepUpForSensitiveAction = requireStepUpForSensitiveAction;
const session_auth_1 = require("./session-auth");
function requireStepUpForSensitiveAction(req) {
    const marker = req.headers.get("x-step-up-authenticated");
    if (marker === "true") {
        return;
    }
    throw new session_auth_1.AuthBoundaryError("FORBIDDEN", "Step-up authentication required for sensitive admin action");
}
