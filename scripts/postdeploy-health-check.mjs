const target = process.env.HEALTHCHECK_URL;
if (!target) {
  console.error("HEALTHCHECK_URL is required for postdeploy health check");
  process.exit(1);
}

const url = `${target.replace(/\/$/, "")}/api/health`;

const response = await fetch(url, { method: "GET", headers: { "accept": "application/json" } });
if (!response.ok) {
  console.error(`Health check failed with status ${response.status} at ${url}`);
  process.exit(1);
}

const payload = await response.json().catch(() => ({}));
if (payload?.status !== "ok") {
  console.error(`Health payload invalid at ${url}`);
  process.exit(1);
}

console.log(`Postdeploy health check passed: ${url}`);
