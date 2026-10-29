import { expect, test } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { awaitListContains } from "./utils/await-ready"


test.describe("Pengaturan Peran CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Role CRUD khusus desktop; sidebar overlay intercepts clicks on mobile")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `role-e2e-${ts}`
    const updated = `role-e2e-updated-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/pengaturan/peran/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tambah Peran" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })
    await page.locator("#name").first().fill(name)
    await expect(page.locator("#name").first()).toHaveValue(name)
    await page.locator("button[type='submit']").click()

    await awaitListContains(page, "**/pengaturan/peran", name)

    // ─── DETAIL ───────────────────────────────────────────────
    const createdRow = page.locator("tr").filter({ hasText: name })
    await expect(createdRow).toBeVisible({ timeout: 30000 })
    await createdRow.locator("a").filter({ hasText: "Detail" }).click({ force: true })

    await page.waitForURL(/\/pengaturan\/peran\/[^/]+$/, { timeout: 30000 })
    await expect(page.getByRole("heading").filter({ hasText: name }).first()).toBeVisible({ timeout: 30000 })

    // ─── UPDATE ───────────────────────────────────────────────
    await page.getByRole("link", { name: "Ubah Peran" }).click({ force: true })
    await page.waitForURL(/\/pengaturan\/peran\/[^/]+\/ubah$/, { timeout: 30000 })
    await expect(page.locator("#name").first()).toBeVisible({ timeout: 30_000 })
    await page.locator("#name").first().fill(updated)
    await expect(page.locator("#name").first()).toHaveValue(updated)
    await page.locator("button[type='submit']").click()

    await awaitListContains(page, "**/pengaturan/peran", updated)

    // ─── DELETE ───────────────────────────────────────────────
    // Server action form: deleteRole → revalidatePath → redirect("/pengaturan/peran")
    // The redirect triggers a React re-render on the same URL.
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    // Hapus memakai dialog konfirmasi (`DeleteButton` → `ConfirmDialog`/AlertDialog):
    // tombolnya `type="button"` ber-aria-label "Hapus", bukan form submit.
    const hapusButton = updatedRow.getByRole("button", { name: "Hapus" })
    await expect(hapusButton).toBeVisible({ timeout: 30000 })

    // Click Hapus → konfirmasi di dialog → server action menghapus & revalidasi
    await hapusButton.click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()
    await page.waitForLoadState("networkidle")

    // Reload and verify — retry up to 3x for resilience under parallel load
    let gone = false
    for (let i = 0; i < 3; i++) {
      await page.goto("/pengaturan/peran", { waitUntil: "domcontentloaded" })
      await expect(page.getByRole("heading", { name: "Peran & Izin" })).toBeVisible({ timeout: 30000 })
      gone = !(await page.locator("body").innerText()).includes(updated)
      if (gone) break
      // Role still exists — retry the delete
      const retryRow = page.locator("tr").filter({ hasText: updated })
      const retryBtn = retryRow.getByRole("button", { name: "Hapus" })
      if (await retryBtn.isVisible().catch(() => false)) {
        await retryBtn.click()
        await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()
        await page.waitForLoadState("networkidle")
      }
    }
    expect(gone).toBe(true)
  })
})
