import { parseEnvironment } from "../.test-dist/lib/env.js";
import assert from "node:assert/strict";

function expectThrows(fn, messagePart) {
  let thrown = false;
  try {
    fn();
  } catch (error) {
    thrown = true;
    if (messagePart) {
      assert.equal(String(error).includes(messagePart), true);
    }
  }
  assert.equal(thrown, true);
}

parseEnvironment({
  NODE_ENV: "development",
  APP_ENV: "development",
  DATABASE_URL: "postgres://dev",
  NEXT_PUBLIC_APP_ENV: "development"
});

parseEnvironment({
  NODE_ENV: "test",
  APP_ENV: "test",
  DATABASE_URL: "postgres://test",
  NEXT_PUBLIC_APP_ENV: "test"
});

parseEnvironment({
  NODE_ENV: "production",
  APP_ENV: "staging",
  DATABASE_URL: "postgres://pooled",
  DIRECT_DATABASE_URL: "postgres://direct",
  SESSION_SECRET: "1234567890123456",
  ENABLE_E2E_SESSION_BOOTSTRAP: "false",
  ENABLE_TEST_AUTH_HELPER: "false",
  NEXT_PUBLIC_APP_ENV: "staging"
});

expectThrows(
  () =>
    parseEnvironment({
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "postgres://pooled",
      SESSION_SECRET: "short",
      NEXT_PUBLIC_APP_ENV: "production"
    }),
  "SESSION_SECRET"
);

expectThrows(
  () =>
    parseEnvironment({
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "postgres://pooled",
      SESSION_SECRET: "1234567890123456",
      ENABLE_E2E_SESSION_BOOTSTRAP: "true",
      NEXT_PUBLIC_APP_ENV: "production"
    }),
  "ENABLE_E2E_SESSION_BOOTSTRAP"
);

expectThrows(
  () =>
    parseEnvironment({
      NODE_ENV: "development",
      APP_ENV: "production",
      DATABASE_URL: "postgres://pooled",
      DIRECT_DATABASE_URL: "postgres://direct",
      SESSION_SECRET: "1234567890123456",
      ENABLE_E2E_SESSION_BOOTSTRAP: "false",
      ENABLE_TEST_AUTH_HELPER: "false",
      NEXT_PUBLIC_APP_ENV: "production"
    }),
  "NODE_ENV"
);

console.log("Deployment config tests passed");
