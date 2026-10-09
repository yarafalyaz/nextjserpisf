import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

// Guards the "quick add" affordance in the customer form's Kategori Pelanggan
// select: a missing category (e.g. "DP 20%") can be created and selected without
// leaving the form. The category is cleaned up in afterAll.
const CATEGORY_NAME = "E2E DP 20% QuickAdd"

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})

test.describe("Quick add kategori pelanggan", () => {
  test.afterAll(async () => {
    const { prisma } = await import("@/lib/db/prisma")
    await prisma.customerCategory.deleteMany({ where: { name: CATEGORY_NAME } })
    await prisma.$disconnect()
  })

  test("creates a missing category from the customer form select", async ({ page }) => {
    await page.goto("/master/pelanggan/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // Open the Kategori Pelanggan combobox (it is a button[role=combobox]).
    const categoryBox = page.getByRole("combobox").first()
    await categoryBox.click()

    // The create-new row is always offered at the bottom of the list.
    await page.getByRole("option", { name: /Tambah baru/i }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.locator("#quick-add-name").fill(CATEGORY_NAME)
    await dialog.locator("#quick-add-downPaymentPercent").fill("20")
    await dialog.locator("#quick-add-submit").click()

    // Dialog closes and the new category is selected on the trigger.
    await expect(dialog).toBeHidden()
    await expect(categoryBox).toContainText(CATEGORY_NAME)
  })
})
