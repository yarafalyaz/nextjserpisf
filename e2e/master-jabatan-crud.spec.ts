import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

test.describe("Master Jabatan CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Jabatan CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Jabatan E2E ${ts}`
    const updated = `Jabatan E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/jabatan/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("heading", { name: "Tambah Jabatan" })).toBeVisible({ timeout: 30000 })

    await page.locator("#name").fill(name)
    await expect(page.locator("#submit-position")).toBeEnabled({ timeout: 15_000 })
    await page.locator("#submit-position").click()

    await page.waitForURL("**/master/jabatan", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page
      .locator("a[href^='/master/jabatan/']")
      .filter({ hasText: name })
      .first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not get detail href")
    await page.goto(detailHref, { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(name, { timeout: 30_000 })

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/master/jabatan", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/master\/jabatan\/[^/]+\/ubah$/, { timeout: 30000 })
    await expect(page.locator("#name")).toBeVisible({ timeout: 30_000 })
    await page.locator("#name").fill(updated)
    await page.locator("#submit-position").click()

    await page.waitForURL("**/master/jabatan", { timeout: 30000 })
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
