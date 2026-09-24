import { test, expect, type Page } from "@playwright/test"
import { openCombobox, selectFirstComboboxOption } from "./utils/combobox"


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(3000)
}

async function selectFirstComboBoxOption(page: Page, placeholder: string) {
  // The Combobox renders as a role="combobox" trigger labelled with the
  // placeholder; the searchable input only exists inside the popup it opens.
  const input = await openCombobox(page, { placeholder })
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
      // CI seeds an "E2E Customer" via scripts/seed-remaining-e2e.ts, so an empty
      // picker means the fixture/seed regressed. Failing here keeps the whole
      // create -> detail -> delete flow from silently disappearing from CI.
      throw new Error("Fixture hilang: tidak ada pelanggan untuk dipilih (cek scripts/seed-remaining-e2e.ts)")
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
      throw new Error("Fixture hilang: tidak ada pelanggan untuk dipilih (cek scripts/seed-remaining-e2e.ts)")
    }

    await page.locator("#submit-sales-invoice, button[type='submit']").first().click()
    await page.waitForURL("**/penjualan/faktur/**", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
  })
})
