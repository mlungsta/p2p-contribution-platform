const requiredKeys = [
  "STAGING_DATABASE_URL",
  "STAGING_DIRECT_DATABASE_URL",
  "STAGING_SESSION_SECRET",
  "STAGING_HEALTHCHECK_URL",
  "TEST_SESSION_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "LOG_PROVIDER_URL",
  "LOG_PROVIDER_TOKEN",
  "ERROR_MONITORING_URL",
  "ERROR_MONITORING_TOKEN"
];

const missing = requiredKeys.filter((k) => !process.env[k] || String(process.env[k]).trim().length === 0);

if (missing.length > 0) {
  console.error(`Staging env verification failed: missing ${missing.length} key(s).`);
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log(`Staging env verification passed: ${requiredKeys.length} keys present.`);
