"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuthenticatedRole = requireAuthenticatedRole;
exports.requireAdminRouteAccess = requireAdminRouteAccess;
exports.requireMemberRouteAccess = requireMemberRouteAccess;
exports.requireRoutePermission = requireRoutePermission;
const headers_1 = require("next/headers");
const navigation_1 = require("next/navigation");
const db_1 = require("@/lib/db");
const permissions_1 = require("@/lib/permissions");
const session_auth_1 = require("@/lib/session-auth");
async function requireAuthenticatedRole() {
    try {
        const reqHeaders = await (0, headers_1.headers)();
        const reqCookies = await (0, headers_1.cookies)();
        const session = await (0, session_auth_1.resolveAuthenticatedSessionFromSources)(reqHeaders, reqCookies, db_1.db);
        return session.actorRole;
    }
    catch {
        (0, navigation_1.redirect)("/auth");
    }
}
async function requireAdminRouteAccess() {
    const role = await requireAuthenticatedRole();
    if (!(0, permissions_1.isAdminRole)(role)) {
        (0, navigation_1.redirect)("/auth");
    }
    return role;
}
async function requireMemberRouteAccess() {
    const role = await requireAuthenticatedRole();
    if (role !== "MEMBER") {
        (0, navigation_1.redirect)("/auth");
    }
    return role;
}
async function requireRoutePermission(permission) {
    const role = await requireAuthenticatedRole();
    if (!(0, permissions_1.hasPermission)(role, permission)) {
        (0, navigation_1.redirect)("/auth");
    }
    return role;
}
