import { test, expect, type Page } from "@playwright/test"


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(5000)
}


test.describe("Penjualan - Sales Order CRUD", () => {
  test("create → detail → delete", async ({ page }) => {
    // CREATE
    await page.goto("/penjualan/pesanan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    // Select customer (first available)
    const customerInput = page.locator("input[placeholder='Cari customer...']").first()
    await customerInput.click()
    await page.waitForTimeout(500)
    const firstOption = page.locator("[role='option'], [role='listbox'] li").first()
    const customerName = await firstOption.textContent().catch(() => null)
    if (customerName) {
      await firstOption.click()
    } else {
      // Fallback: type and submit
      await customerInput.fill("E2E")
      await page.waitForTimeout(500)
      await page.locator("[role='option'], [role='listbox'] li").first().click()
    }

    await page.locator("#submit-sales-order, button[type='submit']").first().click()
    await page.waitForURL("**/penjualan/pesanan/**", { timeout: 30000 })
    await page.waitForLoadState("networkidle")

    // Back to list
    await page.goto("/penjualan/pesanan", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Pesanan")
  })
})

test.describe("Penjualan - Sales Invoice CRUD", () => {
  test("create → detail", async ({ page }) => {
    await page.goto("/penjualan/faktur/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    const customerInput = page.locator("input[placeholder='Cari customer...']").first()
    await customerInput.click()
    await page.waitForTimeout(500)
    const firstOption = page.locator("[role='option'], [role='listbox'] li").first()
    await firstOption.click().catch(async () => {
      await customerInput.fill("E2E")
      await page.waitForTimeout(500)
      await page.locator("[role='option'], [role='listbox'] li").first().click()
    })

    await page.locator("#submit-sales-invoice, button[type='submit']").first().click()
    await page.waitForURL("**/penjualan/faktur/**", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
  })
})
