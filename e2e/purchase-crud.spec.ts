import { test, expect, type Page } from "@playwright/test"


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)
}

test.describe("Pembelian - Purchase Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/pembelian/pesanan", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Pesanan")

    await page.goto("/pembelian/pesanan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat")
  })
})

test.describe("Pembelian - Purchase Request CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/pembelian/permintaan", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Permintaan")

    await page.goto("/pembelian/permintaan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat")
  })
})

test.describe("Pembelian - Goods Receipt CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/pembelian/penerimaan", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Penerimaan")

    await page.goto("/pembelian/penerimaan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat")
  })
})

test.describe("Pembelian - Vendor Bill CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/pembelian/tagihan", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Tagihan")

    await page.goto("/pembelian/tagihan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat")
  })
})
