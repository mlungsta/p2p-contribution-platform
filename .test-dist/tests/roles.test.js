"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const permissions_1 = require("../lib/permissions");
(0, node_test_1.default)("contains required system roles", () => {
    strict_1.default.equal(permissions_1.roles.includes("MEMBER"), true);
    strict_1.default.equal(permissions_1.roles.includes("SUPER_ADMIN"), true);
});
