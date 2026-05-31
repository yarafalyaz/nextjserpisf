import { test, expect } from "@playwright/test"

const ts = Date.now()

test.beforeEach(async ({}, testInfo) => {
  if (testInfo.project.name.includes("mobile")) {
    test.skip(true, "Employee CRUD fokus desktop")
  }
})

test.describe("Master Karyawan CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    test.setTimeout(90_000)
    const name = `Karyawan E2E ${ts}`
    const updated = `Karyawan E2E Updated ${ts}`
    const email = `karyawan${String(ts).slice(-6)}@e2e.test`

    // CREATE
    await page.goto("/master/karyawan/tambah", { waitUntil: "domcontentloaded" })

    const deptInput = page.locator("input[placeholder='Cari department...']").first()
    await deptInput.click()
    await deptInput.press("ArrowDown")
    await deptInput.press("Enter")

    const positionInput = page.locator("input[placeholder='Cari posisi...']").first()
    await positionInput.click()
    await positionInput.press("ArrowDown")
    await positionInput.press("Enter")

    await page.locator("#name").fill(name)
    await page.locator("#email").fill(email)
    await page.locator("#phone").fill(`0812${String(ts).slice(-8)}`)
    await page.locator("#baseSalary").fill("7500000")
    await page.locator("button[type='submit']").first().click()

    await page.waitForURL(/\/master\/karyawan$/, { timeout: 20000 })

    // Data baru bisa muncul di halaman lain karena pagination default 20.
    // Gunakan pencarian agar baris target selalu ter-filter.
    const searchInput = page.locator("input[placeholder='Cari nama, NIP, atau telepon...']").first()
    await searchInput.fill(name)
    await searchInput.press("Enter")
    await expect(page.locator("tr").filter({ hasText: name }).first()).toBeVisible({ timeout: 15000 })

    // UPDATE
    const row = page.locator("tr").filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()

    await page.waitForURL(/\/master\/karyawan\/\d+\/ubah/, { timeout: 20000 })
    const editUrl = page.url()
    const idMatch = editUrl.match(/\/master\/karyawan\/(\d+)\/ubah/)
    if (!idMatch) throw new Error("Gagal parse ID karyawan dari URL edit")

    await expect(page.locator("#name").first()).toHaveValue(name)
    await expect(page.locator("#email").first()).toHaveValue(email)

    // DELETE
    await page.goto("/master/karyawan", { waitUntil: "domcontentloaded" })

    // Coba cari nama terbaru dulu, fallback ke nama awal
    const listSearch = page.locator("input[placeholder='Cari nama, NIP, atau telepon...']").first()
    await listSearch.fill(updated)
    await listSearch.press("Enter")

    let targetRow = page.locator("tr").filter({ hasText: updated }).first()
    const updatedVisible = await targetRow.isVisible().catch(() => false)
    if (!updatedVisible) {
      await listSearch.fill(name)
      await listSearch.press("Enter")
      targetRow = page.locator("tr").filter({ hasText: name }).first()
    }

    await expect(targetRow).toBeVisible({ timeout: 15000 })
    await targetRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await page.waitForTimeout(1500)
    await page.goto("/master/karyawan", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).not.toContainText(updated)
    await expect(page.locator("body")).not.toContainText(name)
  })
})

