export function isSessionBootstrapAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }

  return env.NODE_ENV === "test" || env.PLAYWRIGHT_TEST === "1" || env.ENABLE_E2E_SESSION_BOOTSTRAP === "true";
}
