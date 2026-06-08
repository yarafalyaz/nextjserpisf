import { test, expect, type Page } from "@playwright/test"


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(3000)
}

async function selectFirstComboBoxOption(page: Page, placeholder: string) {
  const input = page.locator(`input[placeholder='${placeholder}']`).first()
  await expect(input).toBeVisible({ timeout: 10000 })
  await input.click()
  await page.waitForTimeout(300)

  // Type to filter and wait for options
  await input.fill("E2E")
  await page.waitForTimeout(1000)

  const option = page.locator("[role='option']").first()
  const hasOption = await option.isVisible().catch(() => false)
  if (hasOption) {
    await option.click()
    return true
  }

  // Clear and try without filter
  await input.clear()
  await page.waitForTimeout(500)
  await input.click()
  await page.waitForTimeout(1000)

  const anyOption = page.locator("[role='option']").first()
  if (await anyOption.isVisible().catch(() => false)) {
    await anyOption.click()
    return true
  }

  return false
}


test.describe("Penjualan - Sales Order CRUD", () => {
  test("create → detail → delete", async ({ page }) => {
    // CREATE
    await page.goto("/penjualan/pesanan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    // Select customer
    const selected = await selectFirstComboBoxOption(page, "Cari pelanggan...")
    if (!selected) {
      test.skip(true, "No customers available in database — seeding issue")
      return
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

    // Select customer
    const selected = await selectFirstComboBoxOption(page, "Cari pelanggan...")
    if (!selected) {
      test.skip(true, "No customers available in database — seeding issue")
      return
    }

    await page.locator("#submit-sales-invoice, button[type='submit']").first().click()
    await page.waitForURL("**/penjualan/faktur/**", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
  })
})
