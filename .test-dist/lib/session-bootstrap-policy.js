"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSessionBootstrapAllowed = isSessionBootstrapAllowed;
function isSessionBootstrapAllowed(env = process.env) {
    if (env.NODE_ENV === "production") {
        return false;
    }
    return env.NODE_ENV === "test" || env.PLAYWRIGHT_TEST === "1" || env.ENABLE_E2E_SESSION_BOOTSTRAP === "true";
}
