import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type E2EState = {
  memberAId: string;
  memberBId: string;
  opsAdminId: string;
  superAdminId: string;
  disputeReadyMatchId: string;
};

const state: E2EState = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tests", "e2e", ".state.json"), "utf8")
);

async function bootstrapSession(page: import("@playwright/test").Page, userId: string) {
  const res = await page.request.post("/api/auth/session", { data: { userId } });
  expect(res.ok()).toBeTruthy();
  const payload = await res.json();
  expect(payload?.ok).toBeTruthy();
}

test("public navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-how-it-works").click();
  await expect(page).toHaveURL(/how-it-works/);
  await page.getByTestId("nav-risk-disclosure").click();
  await expect(page).toHaveURL(/risk-disclosure/);
  await page.getByTestId("nav-faq").click();
  await expect(page).toHaveURL(/faq/);
  await page.getByTestId("nav-contact").click();
  await expect(page).toHaveURL(/contact/);
});

test("member workflow and access restrictions", async ({ page }) => {
  await bootstrapSession(page, state.memberAId);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);

  const offerRes = await page.request.post("/api/contribution-offers", { data: { amountMinor: 11000, currency: "USD" } });
  const offerJson = await offerRes.json();
  expect(offerRes.ok()).toBeTruthy();
  expect(offerJson.ok).toBeTruthy();

  const requestRes = await page.request.post("/api/recipient-requests", { data: { amountMinor: 9000, currency: "USD" } });
  const requestJson = await requestRes.json();
  expect(requestRes.ok()).toBeTruthy();
  expect(requestJson.ok).toBeTruthy();

  const disputeRes = await page.request.post("/api/disputes", {
    data: { matchId: state.disputeReadyMatchId, reason: "Recipient has not acknowledged payment yet" }
  });
  const disputeJson = await disputeRes.json();
  expect(disputeRes.ok()).toBeTruthy();
  expect(disputeJson.ok).toBeTruthy();

  await page.goto("/admin/matches");
  await expect(page).toHaveURL(/\/auth$/);
});

test("admin workflow with safe mode controls", async ({ page, context }) => {
  await bootstrapSession(page, state.superAdminId);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);

  const runBatchRes = await page.request.post("/api/matching/run-batch", {
    data: { batchRunId: `e2e_batch_${Date.now()}`, idempotencyKey: `e2e_idem_${Date.now()}` }
  });
  const runBatchJson = await runBatchRes.json();
  expect(runBatchRes.ok()).toBeTruthy();
  expect(runBatchJson.ok).toBeTruthy();

  const badOverride = await page.request.post("/api/admin/overrides", {
    headers: { "x-step-up-authenticated": "true" },
    data: {
      batchRunId: `e2e_ovr_${Date.now()}`,
      offerId: "bad_offer",
      requestId: "bad_request",
      amountMinor: 500,
      reason: "no"
    }
  });
  const badOverrideJson = await badOverride.json();
  expect(badOverride.status()).toBe(400);
  expect(badOverrideJson.ok).toBeFalsy();

  const auditRes = await page.request.get("/api/admin/audit-logs");
  const auditJson = await auditRes.json();
  expect(auditRes.ok()).toBeTruthy();
  expect(auditJson.ok).toBeTruthy();

  await page.goto("/admin");
  await expect(page.getByTestId("refresh-safe-mode")).toBeVisible();
  const safeModeSet = await page.request.patch("/api/admin/safe-mode", { headers: { "x-step-up-authenticated": "true" }, data: { enabled: true } });
  const safeModeSetJson = await safeModeSet.json();
  expect(safeModeSet.ok()).toBeTruthy();
  expect(safeModeSetJson.ok).toBeTruthy();
  const safeModeRead = await page.request.get("/api/admin/safe-mode");
  const safeModeReadJson = await safeModeRead.json();
  expect(safeModeRead.ok()).toBeTruthy();
  expect(safeModeReadJson.data.enabled).toBe(true);

  await page.goto("/auth");
  await page.request.delete("/api/auth/session");
  await bootstrapSession(page, state.opsAdminId);

  const blockedRes = await page.request.post("/api/matching/run-batch", {
    data: { batchRunId: `e2e_blocked_${Date.now()}`, idempotencyKey: `e2e_blocked_idem_${Date.now()}` }
  });
  const blockedJson = await blockedRes.json();
  expect(blockedRes.ok()).toBeFalsy();
  expect(blockedJson.error.code).toBe("SAFE_MODE_BLOCKED");
  expect(typeof blockedJson.error.correlationId).toBe("string");

  // cleanup for subsequent runs
  await page.goto("/auth");
  await page.request.delete("/api/auth/session");
  await bootstrapSession(page, state.superAdminId);
  const safeModeOff = await page.request.patch("/api/admin/safe-mode", { headers: { "x-step-up-authenticated": "true" }, data: { enabled: false } });
  const safeModeOffSetJson = await safeModeOff.json();
  expect(safeModeOff.ok()).toBeTruthy();
  expect(safeModeOffSetJson.ok).toBeTruthy();
  await page.goto("/admin");
  const safeModeOffRead = await page.request.get("/api/admin/safe-mode");
  const safeModeOffJson = await safeModeOffRead.json();
  expect(safeModeOffRead.ok()).toBeTruthy();
  expect(safeModeOffJson.data.enabled).toBe(false);

  await context.clearCookies();
});
