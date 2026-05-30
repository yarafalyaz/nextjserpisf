import { expect, test } from "@playwright/test"

const ts = Date.now()

test.beforeEach(async ({}, testInfo) => {
  if (testInfo.project.name.includes("mobile")) {
    test.skip(true, "Role CRUD khusus desktop; tabel aksi kurang stabil di mobile")
  }
})

test.describe("Pengaturan Peran CRUD", () => {
  test("create → detail → update → delete", async ({ page }) => {
    const name = `role-e2e-${ts}`
    const updated = `role-e2e-updated-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/pengaturan/peran/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tambah Role" })).toBeVisible()
    await page.locator("#name").fill(name)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/pengaturan/peran", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const createdRow = page.locator("tr").filter({ hasText: name })
    await expect(createdRow).toBeVisible()
    await createdRow.locator("a").filter({ hasText: "Detail" }).click()

    await page.waitForURL(/\/pengaturan\/peran\/\d+$/, { timeout: 15000 })
    await expect(page.getByRole("heading").filter({ hasText: name }).first()).toBeVisible()

    // ─── UPDATE ───────────────────────────────────────────────
    await page.getByRole("link", { name: "Edit Role" }).click()
    await page.waitForURL(/\/pengaturan\/peran\/\d+\/ubah$/, { timeout: 15000 })
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/pengaturan/peran", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    // The delete form uses a server action that redirects to the same page.
    // waitForURL would resolve immediately since we're already on the target URL.
    // So we use a response listener to wait for the server action to complete.
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()

    const hapusButton = updatedRow.locator("button", { hasText: "Hapus" })
    await expect(hapusButton).toBeVisible()

    // Wait for the server action response before checking
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/pengaturan/peran") && resp.status() < 400,
      { timeout: 15000 }
    )
    await hapusButton.click()
    await responsePromise.catch(() => undefined) // ignore if no matching response

    // Reload to get fresh server-rendered data
    await page.goto("/pengaturan/peran", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 10000 })
  })
})
