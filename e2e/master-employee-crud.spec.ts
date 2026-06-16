import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"


test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name, "Employee CRUD fokus desktop")
})

test.describe("Master Karyawan CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    test.setTimeout(90_000)
    const name = `Karyawan E2E ${ts}`
    const updated = `Karyawan E2E Updated ${ts}`
    const email = `karyawan${String(ts).slice(-6)}@e2e.test`
    const phone = `0812${String(ts).slice(-8)}`

    // CREATE
    await page.goto("/master/karyawan/tambah", { waitUntil: "domcontentloaded" })

    const deptInput = page.locator("input[placeholder='Cari departemen...']").first()
    await deptInput.click()
    await deptInput.press("ArrowDown")
    await deptInput.press("Enter")

    const positionInput = page.locator("input[placeholder='Cari jabatan...']").first()
    await positionInput.click()
    await positionInput.press("ArrowDown")
    await positionInput.press("Enter")

    await page.locator("#name").fill(name)
    await page.locator("#email").fill(email)
    await page.locator("#phone").fill(phone)
    await page.locator("#baseSalary").fill("7500000")
    await page.locator("button[type='submit']").first().click()

    await page.waitForURL(/\/master\/karyawan$/, { timeout: 20000 })

    // Data baru bisa muncul di halaman lain karena pagination default 20.
    // Gunakan pencarian agar baris target selalu ter-filter.
    const searchInput = page.locator("input[placeholder='Cari nama, NIP, atau telepon...']").first()
    await searchInput.fill(name)
    await searchInput.press("Enter")
    await expect(page.locator("tr").filter({ hasText: name }).first()).toBeVisible({ timeout: 30000 })

    // UPDATE
    const row = page.locator("tr").filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/master\/karyawan\/\d+\/ubah/, { timeout: 20000 })

    await expect(page.locator("#name").first()).toHaveValue(name)
    await expect(page.locator("#email").first()).toHaveValue(email)

    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").first().click()

    // Beberapa kondisi tidak auto-redirect meski update sukses.
    // Verifikasi via toast lalu lanjut ke halaman list secara eksplisit.
    const successToast = page.locator("text=Data berhasil diperbarui").first()
    await expect(successToast).toBeVisible({ timeout: 20000 })

    await page.goto("/master/karyawan", { waitUntil: "domcontentloaded" })

    const postUpdateSearch = page.locator("input[placeholder='Cari nama, NIP, atau telepon...']").first()
    await postUpdateSearch.fill(updated)
    await postUpdateSearch.press("Enter")
    await expect(page.locator("tr").filter({ hasText: updated }).first()).toBeVisible({ timeout: 30000 })

    // DELETE
    await page.goto("/master/karyawan", { waitUntil: "domcontentloaded" })

    // DataTable filter bawaan EmployeeTable terikat ke kolom name.
    // Cari nama terbaru agar tidak bergantung pada telepon yang tidak difilter client-side.
    const listSearch = page.locator("input[placeholder='Cari nama, NIP, atau telepon...']").first()
    await listSearch.fill(updated)
    await listSearch.press("Enter")

    const targetRow = page.locator("tr").filter({ hasText: updated }).first()
    await expect(targetRow).toBeVisible({ timeout: 30000 })
    await targetRow.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await expect(page.locator("[role='dialog']")).toBeHidden({ timeout: 10000 })
    await expect(page.locator("text=Data berhasil dihapus").first()).toBeVisible({ timeout: 30000 })

    await page.goto("/master/karyawan", { waitUntil: "domcontentloaded" })
    const postDeleteSearch = page.locator("input[placeholder='Cari nama, NIP, atau telepon...']").first()
    await postDeleteSearch.fill(updated)
    await postDeleteSearch.press("Enter")
    await expect(page.locator("tr").filter({ hasText: updated })).toHaveCount(0)
  })
})

