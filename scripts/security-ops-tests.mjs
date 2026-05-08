import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { clearRateLimitStore, checkRateLimit } from "../.test-dist/lib/rate-limit.js";
import { parseEnvironment, resetEnvironmentCache } from "../.test-dist/lib/env.js";
import { executeWithErrorHandling } from "../.test-dist/server/services/runtime-api-service.js";
import { setStructuredLogProvider } from "../.test-dist/lib/logger.js";
import { isSessionBootstrapAllowed } from "../.test-dist/lib/session-bootstrap-policy.js";

function createReq(url, method = "GET", headers = {}) {
  return new NextRequest(url, { method, headers });
}

async function run() {
  clearRateLimitStore();

  const req = createReq("http://localhost/api/health", "GET", { "x-forwarded-for": "10.0.0.1" });
  const okOne = await checkRateLimit(req, "public", { max: 2, windowMs: 60_000 });
  const okTwo = await checkRateLimit(req, "public", { max: 2, windowMs: 60_000 });
  const blocked = await checkRateLimit(req, "public", { max: 2, windowMs: 60_000 });
  assert.equal(okOne.allowed, true);
  assert.equal(okTwo.allowed, true);
  assert.equal(blocked.allowed, false);

  assert.equal(isSessionBootstrapAllowed({ NODE_ENV: "production" }), false);
  assert.equal(isSessionBootstrapAllowed({ NODE_ENV: "test" }), true);

  assert.throws(() =>
    parseEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      SESSION_SECRET: "short"
    }), /Environment validation failed/
  );

  assert.doesNotThrow(() =>
    parseEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://x"
    })
  );

  const nextConfigModule = await import("../next.config.js");
  const nextConfig = nextConfigModule.default ?? nextConfigModule;
  const headersConfig = await nextConfig.headers();
  const globalHeaders = headersConfig.find((h) => h.source === "/:path*")?.headers ?? [];
  const headerKeys = globalHeaders.map((h) => h.key);
  assert.equal(headerKeys.includes("Content-Security-Policy"), true);
  assert.equal(headerKeys.includes("X-Frame-Options"), true);
  assert.equal(headerKeys.includes("Referrer-Policy"), true);
  assert.equal(headerKeys.includes("Permissions-Policy"), true);

  const captured = [];
  setStructuredLogProvider({
    write(payload) {
      captured.push(payload);
    }
  });

  const failing = await executeWithErrorHandling(
    { actorUserId: "member_1", actorRole: "MEMBER", correlationId: "corr-security-1", triggerSource: "test" },
    async () => {
      throw new Error("boom");
    }
  );

  assert.equal(failing.ok, false);
  const runtimeErrorLog = captured.find((l) => l.message === "runtime_api_error");
  assert.equal(Boolean(runtimeErrorLog), true);
  assert.equal(runtimeErrorLog.correlation_id, "corr-security-1");

  resetEnvironmentCache();

  console.log("Security ops tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
