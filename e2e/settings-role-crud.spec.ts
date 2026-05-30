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

    await page.goto("/pengaturan/peran/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tambah Role" })).toBeVisible()
    await page.locator("#name").fill(name)
    await page.locator("button[type='submit']").click()

    await Promise.race([
      page.waitForURL("**/pengaturan/peran", { timeout: 6000 }),
      page.waitForTimeout(6000),
    ])
    await page.goto("/pengaturan/peran", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    const createdRow = page.locator("tr").filter({ hasText: name })
    await expect(createdRow).toBeVisible()
    await createdRow.locator("a").filter({ hasText: "Detail" }).click()

    await page.waitForURL(/\/pengaturan\/peran\/\d+$/, { timeout: 15000 })
    await expect(page.getByRole("heading").filter({ hasText: name }).first()).toBeVisible()

    await page.getByRole("link", { name: "Edit Role" }).click()
    await page.waitForURL(/\/pengaturan\/peran\/\d+\/ubah$/, { timeout: 15000 })
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()

    await Promise.race([
      page.waitForURL("**/pengaturan/peran", { timeout: 6000 }),
      page.waitForTimeout(6000),
    ])
    await page.goto("/pengaturan/peran", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()

    const deleteForm = updatedRow.locator("form").first()
    await expect(deleteForm).toBeVisible()

    await Promise.all([
      page.waitForLoadState("networkidle"),
      deleteForm.evaluate((form: HTMLFormElement) => form.requestSubmit()),
    ])

    await page.goto("/pengaturan/peran", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 15000 })
  })
})
