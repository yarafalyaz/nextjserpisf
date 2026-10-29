import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

test.describe("Master Bank CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Bank CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `bank-e2e-${ts}`
    const code = `BNK${ts}`
    const updated = `bank-e2e-updated-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/bank/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("heading", { name: "Tambah Bank" })).toBeVisible({ timeout: 30000 })

    await page.locator("#name").fill(name)
    await page.locator("#code").fill(code)
    await expect(page.locator("button[type='submit']")).toBeEnabled({ timeout: 15_000 })
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/master/bank", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    // Extract href from link and navigate directly (checkbox intercepts clicks)
    const detailLink = page.getByRole("link", { name }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Detail link has no href")

    await page.goto(href, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name, { timeout: 30_000 })
    await expect(page.locator("body")).toContainText(code)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/master/bank", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/master\/bank\/[^/]+\/ubah$/, { timeout: 30000 })
    await expect(page.locator("#name")).toBeVisible({ timeout: 30_000 })
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/master/bank", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.getByRole("row", { name: new RegExp(updated) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    await updatedRow.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()

    await page.getByRole("button", { name: "Hapus" }).last().click()
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("row", { name: new RegExp(updated) })).toHaveCount(0, { timeout: 30000 })
  })
})
