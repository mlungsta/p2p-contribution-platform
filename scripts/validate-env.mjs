import { parseEnvironment } from "../.test-dist/lib/env.js";

function fail(message) {
  console.error(message);
  process.exit(1);
}

try {
  const env = parseEnvironment(process.env);
  console.log(`Environment validation passed for APP_ENV=${env.APP_ENV} NODE_ENV=${env.NODE_ENV}`);
} catch (error) {
  fail(`Environment validation failed: ${error instanceof Error ? error.message : String(error)}`);
}
