"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationSchema = exports.envSchema = void 0;
exports.validateInput = validateInput;
const zod_1 = require("zod");
exports.envSchema = zod_1.z.object({
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required")
});
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20)
});
function validateInput(schema, input) {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
        throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
    }
    return parsed.data;
}
