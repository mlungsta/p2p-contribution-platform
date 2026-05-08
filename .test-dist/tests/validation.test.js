"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const validation_1 = require("../lib/validation");
(0, node_test_1.default)("coerces and validates pagination", () => {
    const result = (0, validation_1.validateInput)(validation_1.paginationSchema, { page: "2", pageSize: "50" });
    strict_1.default.equal(result.page, 2);
    strict_1.default.equal(result.pageSize, 50);
});
(0, node_test_1.default)("throws on invalid payload", () => {
    strict_1.default.throws(() => (0, validation_1.validateInput)(validation_1.paginationSchema, { page: 0, pageSize: 1000 }), /Validation failed/);
});
