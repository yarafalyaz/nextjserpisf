import { test, expect, type Page } from "@playwright/test"

async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(5000)
}

test.describe("Produksi - Production Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/production-orders", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Production")

    await page.goto("/produksi/production-orders/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat")
  })
})

test.describe("Produksi - Work Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/perintah-kerja", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Perintah Kerja")

    await page.goto("/produksi/perintah-kerja/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat")
  })
})

test.describe("Produksi - Products CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/products", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Product")

    await page.goto("/produksi/products/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Tambah Produk")
  })
})
