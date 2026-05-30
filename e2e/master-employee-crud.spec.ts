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
    const updatedEmail = `karyawanupd${String(ts).slice(-6)}@e2e.test`

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

    await page.waitForURL("**/master/karyawan", { timeout: 20000 })
    await expect(page.locator("body")).toContainText(name)

    // UPDATE
    const row = page.locator("tr").filter({ hasText: name })
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()

    await page.waitForURL(/\/master\/karyawan\/\d+\/ubah/, { timeout: 20000 })
    const editUrl = page.url()
    const idMatch = editUrl.match(/\/master\/karyawan\/(\d+)\/ubah/)
    if (!idMatch) throw new Error("Gagal parse ID karyawan dari URL edit")
    const employeeId = idMatch[1]

    await page.locator("#name").fill(updated)
    await page.locator("#email").fill(updatedEmail)
    await page.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit())

    // Sukses update harus redirect ke listing
    await page.waitForURL("**/master/karyawan", { timeout: 20000 })
    await expect(page.locator("body")).toContainText(updated)

    // Verifikasi ulang dari halaman edit by id
    await page.goto(`/master/karyawan/${employeeId}/ubah`, { waitUntil: "domcontentloaded" })
    await expect(page.locator("#name")).toHaveValue(updated)
    await expect(page.locator("#email")).toHaveValue(updatedEmail)

    // DELETE
    await page.goto("/master/karyawan", { waitUntil: "domcontentloaded" })

    const rowAfterUpdate = page.locator("tr").filter({ hasText: updated }).first()
    const rowCount = await rowAfterUpdate.count()
    const targetRow = rowCount > 0 ? rowAfterUpdate : page.locator("tr").filter({ hasText: name }).first()

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

