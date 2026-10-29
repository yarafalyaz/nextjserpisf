import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { awaitListContains } from "./utils/await-ready"


test.describe("Master Departemen CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Departemen CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Departemen E2E ${ts}`
    const updated = `Departemen E2E Updated ${ts}`
    const description = `Deskripsi E2E ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/departemen/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tambah Departemen" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })

    await page.locator("#name").fill(name)
    await page.locator("#description").fill(description)
    await expect(page.locator("#submit-department")).toBeEnabled({ timeout: 15_000 })
    await page.locator("#submit-department").click()

    await awaitListContains(page, "**/master/departemen", name)
    await page.goto(`/master/departemen?cari=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page
      .locator("a[href^='/master/departemen/']")
      .filter({ hasText: name })
      .first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not get detail href")
    await page.goto(detailHref, { waitUntil: "domcontentloaded" })

    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto(`/master/departemen?cari=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const rowForEdit = page.locator("tr").filter({ hasText: name }).first()
    await expect(rowForEdit).toBeVisible({ timeout: 30000 })

    await rowForEdit.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/master\/departemen\/[^/]+\/ubah$/, { timeout: 30000 })
    await expect(page.locator("#name")).toBeVisible({ timeout: 30_000 })
    await page.locator("#name").fill(updated)
    await expect(page.locator("#name")).toHaveValue(updated)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/master/departemen", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await page.goto(`/master/departemen?cari=${encodeURIComponent(updated)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    await updatedRow.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()

    const confirmBtn = page.locator("button").filter({ hasText: "Hapus" }).last()
    await expect(confirmBtn).toBeVisible({ timeout: 30000 })
    await confirmBtn.click({ force: true })

    await page.waitForLoadState("networkidle")
    await expect(updatedRow).toBeHidden({ timeout: 30000 })
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 5000 })
  })
})
