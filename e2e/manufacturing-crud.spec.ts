import { test, expect, type Page } from "@playwright/test"

async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30000 })
  await page.waitForTimeout(2000)
}

test.describe("Produksi - Production Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/production-orders", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Production", { timeout: 30000 })

    await page.goto("/produksi/production-orders/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat", { timeout: 30000 })
  })
})

test.describe("Produksi - Work Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/perintah-kerja", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Perintah Kerja", { timeout: 30000 })

    await page.goto("/produksi/perintah-kerja/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat", { timeout: 30000 })
  })
})

test.describe("Produksi - Products CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/products", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Product", { timeout: 30000 })

    await page.goto("/produksi/products/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Tambah Produk", { timeout: 30000 })
  })
})
