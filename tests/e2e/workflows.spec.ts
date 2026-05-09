import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type E2EState = {
  memberAId: string;
  memberBId: string;
  opsAdminId: string;
  superAdminId: string;
  disputeReadyMatchId: string;
  proofReadyMatchId: string;
  memberEmail: string;
  opsEmail: string;
  superEmail: string;
  loginPassword: string;
};

const state: E2EState = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tests", "e2e", ".state.json"), "utf8")
);

async function loginThroughUi(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-sign-in").click();
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

test("member login redirect and member workflow via UI", async ({ page }) => {
  await loginThroughUi(page, state.memberEmail, state.loginPassword);
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.getByText("Contributions made")).toBeVisible();
  await expect(page.getByText("Contributions received")).toBeVisible();
  await expect(page.getByText("Pending matches")).toBeVisible();

  await page.goto("/dashboard/contributions");
  await page.getByTestId("offer-amount").fill("11000");
  await page.getByTestId("submit-offer").click();
  await expect(page.getByTestId("action-success").first()).toContainText("Contribution offer submitted.");

  await page.getByTestId("request-amount").fill("9000");
  await page.getByTestId("submit-request").click();
  await expect(page.getByTestId("action-success").nth(1)).toContainText("Recipient request submitted.");

  await page.goto("/dashboard/matches");
  await page.getByTestId("upload-proof").click();
  await expect(page.getByTestId("action-success").first()).toContainText("Proof metadata uploaded.");

  await page.goto("/dashboard/disputes");
  await page.getByTestId("submit-dispute").click();
  await expect(page.getByTestId("action-success")).toContainText("Dispute opened.");

  await page.goto("/dashboard/cg-calculator");
  await expect(page.getByText("Disclaimer: estimate only, not guaranteed.")).toBeVisible();

  await page.goto("/admin/matches");
  await expect(page).toHaveURL(/\/auth$/);
});

test("admin login redirect, safe mode state, and admin workflow via UI", async ({ page }) => {
  await loginThroughUi(page, state.superEmail, state.loginPassword);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("admin-safe-mode-state")).toBeVisible();

  await page.getByTestId("disable-safe-mode").click();

  const runBatchRes = await page.request.post("/api/matching/run-batch", {
    data: { batchRunId: `e2e_ui_batch_${Date.now()}`, idempotencyKey: `e2e_ui_idem_${Date.now()}` }
  });
  const runBatchJson = await runBatchRes.json();
  expect(runBatchRes.ok()).toBeTruthy();
  expect(runBatchJson.ok).toBeTruthy();

  await page.goto("/admin/disputes");
  const resolveButton = page.getByTestId("resolve-dispute");
  if (await resolveButton.isVisible() && await resolveButton.isEnabled()) {
    await resolveButton.click();
    await expect(page.getByTestId("action-success")).toContainText("Dispute resolved.");
  }

  await page.goto("/admin/audit-logs");
  await page.getByTestId("load-audit-logs").click();
  await expect(page.getByTestId("action-success")).toContainText("Audit logs loaded.");

  await page.goto("/auth");
  await page.getByTestId("auth-sign-out").click();
  await expect(page).toHaveURL(/\/auth$/);
});

test("ops admin login redirects to admin", async ({ page }) => {
  await loginThroughUi(page, state.opsEmail, state.loginPassword);
  await expect(page).toHaveURL(/\/admin$/);
});


