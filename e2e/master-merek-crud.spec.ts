import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)
}


test.describe("Master Merek CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Merek CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Brand E2E ${ts}`
    const updated = `Brand E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/merek/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Tambah Merek" })).toBeVisible({ timeout: 30000 })

    await page.locator("#name").fill(name)
    await waitForHydration(page)
    await page.locator("#submit-brand").click()
    await page.waitForURL("**/master/merek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page
      .locator("a[href^='/master/merek/']")
      .filter({ hasText: name })
      .first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not get detail href")
    await page.goto(detailHref, { waitUntil: "domcontentloaded" })

    await waitForHydration(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/master/merek", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/master\/merek\/[^/]+\/ubah$/, { timeout: 30000 })

    await page.locator("#name").fill(updated)
    await waitForHydration(page)
    await page.getByRole("button", { name: /Update|Perbarui/ }).click()

    await page.waitForURL("**/master/merek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.getByRole("row", { name: new RegExp(updated) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    await updatedRow.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()

    // Confirm dialog
    await page.getByRole("button", { name: "Hapus" }).last().click()
    await page.waitForLoadState("networkidle")

    // Verify gone
    await expect(page.getByRole("row", { name: new RegExp(updated) })).toHaveCount(0, { timeout: 30000 })
  })
})
