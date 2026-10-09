import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

// Guards the generic quick-add affordance wired through QuickAddSelect/registry.
// Uses the Gudang (warehouse) picker on the rack create form as the concrete
// example: a missing warehouse is created inline and auto-selected. The created
// warehouse is torn down afterwards.
const WAREHOUSE_NAME = "E2E QuickAdd Gudang"

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})

test.describe("Quick add gudang dari form rak", () => {
  test.afterAll(async () => {
    const { prisma } = await import("@/lib/db/prisma")
    await prisma.rack.deleteMany({ where: { warehouse: { name: WAREHOUSE_NAME } } })
    await prisma.warehouse.deleteMany({ where: { name: WAREHOUSE_NAME } })
    await prisma.$disconnect()
  })

  test("creates a missing warehouse from the rack form select", async ({ page }) => {
    await page.goto("/inventaris/rak/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // The Gudang combobox carries the id from the form.
    const warehouseBox = page.locator("#warehouseIdSelect")
    await warehouseBox.click()

    await page.getByRole("option", { name: /Tambah baru/i }).first().click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.locator("#quick-add-name").fill(WAREHOUSE_NAME)
    // code is optional; leave blank (auto-generated).
    await dialog.locator("#quick-add-submit").click()

    await expect(dialog).toBeHidden()
    await expect(warehouseBox).toContainText(WAREHOUSE_NAME)
  })
})
