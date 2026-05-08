"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEnvironment = parseEnvironment;
exports.validateEnvironment = validateEnvironment;
exports.resetEnvironmentCache = resetEnvironmentCache;
const zod_1 = require("zod");
const nodeEnvSchema = zod_1.z.enum(["development", "test", "production"]);
const appEnvSchema = zod_1.z.enum(["development", "test", "staging", "production"]);
const envSchema = zod_1.z.object({
    NODE_ENV: nodeEnvSchema,
    APP_ENV: appEnvSchema,
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    DIRECT_DATABASE_URL: zod_1.z.string().optional(),
    SESSION_SECRET: zod_1.z.string().optional(),
    ENABLE_E2E_SESSION_BOOTSTRAP: zod_1.z.string().optional(),
    ENABLE_TEST_AUTH_HELPER: zod_1.z.string().optional(),
    PLAYWRIGHT_TEST: zod_1.z.string().optional(),
    NEXT_PUBLIC_APP_ENV: zod_1.z.string().optional(),
    HEALTHCHECK_URL: zod_1.z.string().optional(),
    UPSTASH_REDIS_REST_URL: zod_1.z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: zod_1.z.string().optional(),
    LOG_PROVIDER_URL: zod_1.z.string().optional(),
    LOG_PROVIDER_TOKEN: zod_1.z.string().optional(),
    ERROR_MONITORING_URL: zod_1.z.string().optional(),
    ERROR_MONITORING_TOKEN: zod_1.z.string().optional()
});
let cachedEnv = null;
function productionRequirements(env) {
    const errors = [];
    const hardenedEnv = env.APP_ENV === "staging" || env.APP_ENV === "production";
    if (hardenedEnv) {
        if (!env.SESSION_SECRET || env.SESSION_SECRET.trim().length < 16) {
            errors.push("SESSION_SECRET must be set and at least 16 characters in staging/production");
        }
        if (env.ENABLE_E2E_SESSION_BOOTSTRAP === "true") {
            errors.push("ENABLE_E2E_SESSION_BOOTSTRAP cannot be true in staging/production");
        }
        if (env.ENABLE_TEST_AUTH_HELPER === "true") {
            errors.push("ENABLE_TEST_AUTH_HELPER cannot be true in staging/production");
        }
        if (!env.DIRECT_DATABASE_URL || env.DIRECT_DATABASE_URL.trim().length < 1) {
            errors.push("DIRECT_DATABASE_URL is required in staging/production for migration discipline");
        }
    }
    if (env.APP_ENV === "production" && env.NODE_ENV !== "production") {
        errors.push("NODE_ENV must be production when APP_ENV=production");
    }
    if (env.APP_ENV === "test" && env.NODE_ENV !== "test") {
        errors.push("NODE_ENV must be test when APP_ENV=test");
    }
    if (env.NEXT_PUBLIC_APP_ENV && env.NEXT_PUBLIC_APP_ENV !== env.APP_ENV) {
        errors.push("NEXT_PUBLIC_APP_ENV must match APP_ENV");
    }
    return errors;
}
function parseEnvironment(input = process.env) {
    const rawNodeEnv = input.NODE_ENV;
    const safeNodeEnv = rawNodeEnv === "development" || rawNodeEnv === "test" || rawNodeEnv === "production" ? rawNodeEnv : "development";
    const rawAppEnv = input.APP_ENV;
    const safeAppEnv = rawAppEnv === "development" || rawAppEnv === "test" || rawAppEnv === "staging" || rawAppEnv === "production"
        ? rawAppEnv
        : safeNodeEnv === "production"
            ? "production"
            : safeNodeEnv === "test"
                ? "test"
                : "development";
    const normalized = {
        ...input,
        NODE_ENV: safeNodeEnv,
        APP_ENV: safeAppEnv
    };
    const parsed = envSchema.parse(normalized);
    const requirementErrors = productionRequirements(parsed);
    if (requirementErrors.length > 0) {
        throw new Error(`Environment validation failed: ${requirementErrors.join("; ")}`);
    }
    return parsed;
}
function validateEnvironment() {
    if (!cachedEnv) {
        cachedEnv = parseEnvironment(process.env);
    }
    return cachedEnv;
}
function resetEnvironmentCache() {
    cachedEnv = null;
}
