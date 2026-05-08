# Next.js Hosting Readiness (Vercel/Serverless)

## Build/Runtime
- Build command: `npm run build`
- Install command: `npm ci`
- Start command (non-serverless hosts): `npm run start`
- Node version: 20+

## Environment Variables by Host
- Required on staging/production:
  - `APP_ENV`
  - `NEXT_PUBLIC_APP_ENV`
  - `NODE_ENV`
  - `DATABASE_URL` (pooled)
  - `DIRECT_DATABASE_URL` (direct)
  - `SESSION_SECRET`
  - `ENABLE_E2E_SESSION_BOOTSTRAP=false`
  - `ENABLE_TEST_AUTH_HELPER=false`
  - `HEALTHCHECK_URL`

## API Route Compatibility Notes
- Routes are stateless and DB-backed; no local filesystem persistence assumptions.
- Rate limiting is currently in-memory and process-local.
- For multi-instance/serverless scale, switch to shared store (Redis/Upstash).
- Auth/session revocation is DB-backed (`auth_sessions`), compatible with serverless.
- Keep Prisma client singleton usage (`src/lib/db.ts`) for connection reuse.

## Vercel Notes
- Set all env vars per environment (Preview/Staging/Production) explicitly.
- Use Neon pooled URL as runtime `DATABASE_URL`.
- Use Neon direct URL as `DIRECT_DATABASE_URL` for migration jobs.
- Run migrations from CI job (`npm run deploy:staging:migrate` / `npm run deploy:production:migrate`), not from runtime requests.
- Keep health endpoint reachable at `/api/health` for postdeploy check.

## Predeploy/Deploy Sequence
1. `npm run predeploy:checks`
2. `npm run deploy:staging:migrate` or `npm run deploy:production:migrate`
3. Deploy app artifact
4. `npm run postdeploy:health`
