import { expect, type Page } from "@playwright/test"

/**
 * Tunggu halaman siap: network idle + penanda utama tampil.
 * Satu sumber — 15 spec CRUD memanggil pola networkidle+visible yang sama
 * (dihitung Sonar sebagai duplikasi new-code bila ditulis per berkas).
 */
export async function awaitReady(page: Page, marker = "form") {
  await page.waitForLoadState("networkidle")
  await expect(page.locator(marker).first()).toBeVisible({ timeout: 30_000 })
}

/** Goto + siap: hilangkan trio goto/networkidle/visible per berkas. */
export async function gotoReady(page: Page, url: string, marker = "form") {
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await awaitReady(page, marker)
}

/** Sesudah navigasi list: tunggu URL + idle + teks baris tampil. */
export async function awaitListContains(page: Page, url: string, text: string) {
  await page.waitForURL(url, { timeout: 30000 })
  await page.waitForLoadState("networkidle")
  await expect(page.locator("body")).toContainText(text)
}
