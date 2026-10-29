import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { selectComboboxOptionBySearch, selectFirstComboboxOption } from "./utils/combobox"
import { awaitReady } from "./utils/await-ready"


test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


test.describe("Proyek CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Proyek E2E ${ts}`
    const updated = `Proyek E2E Updated ${ts}`
    const desc = "Deskripsi proyek e2e"
    const updatedDesc = "Deskripsi proyek e2e updated"

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/proyek/tambah", { waitUntil: "domcontentloaded" })
    await awaitReady(page)

    // Filter "E2E" dulu (seed CI), fallback opsi pertama tanpa filter —
    // helper bersama combobox.ts, bukan duplikat lokal + sleep.
    const selected =
      (await selectComboboxOptionBySearch(page, { placeholder: "Cari pelanggan..." }, "E2E")) ||
      (await selectFirstComboboxOption(page, { placeholder: "Cari pelanggan..." }))
    if (!selected) {
      // CI seeds an "E2E Customer" via scripts/seed-remaining-e2e.ts, so an empty
      // picker means the fixture/seed regressed. Failing here keeps the project
      // create -> detail -> delete flow from silently vanishing from CI.
      throw new Error("Fixture hilang: tidak ada pelanggan untuk dipilih (cek scripts/seed-remaining-e2e.ts)")
    }

    await page.locator("#name").fill(name)
    await page.locator("#description").fill(desc)
    await page.getByRole("button", { name: "Simpan Proyek" }).click()
    await page.waitForURL("**/proyek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ────────────────────────────────────────────────
    const row = page.locator("tr").filter({ hasText: name })
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/proyek\/[^/]+\/ubah/, { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    await page.locator("#name").fill(updated)
    await page.locator("#description").fill(updatedDesc)
    await page.getByRole("button", { name: /Update|Perbarui/ }).first().click()
    await page.waitForURL("**/proyek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ────────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible({ timeout: 30000 })
    await updatedRow.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto("/proyek", { waitUntil: "domcontentloaded" })
    await awaitReady(page, "body")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})
