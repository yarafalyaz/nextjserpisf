import type { Page } from "@playwright/test"

/**
 * Helper untuk AppDatePicker/AppMonthPicker (src/components/ui).
 *
 * Kedua picker ini BUKAN <input>: pemicunya tombol `#<name>-trigger` dan
 * nilainya hidup di input tersembunyi. Spec lama yang melakukan
 * `locator("#period").fill(...)` atau `locator("#holidayDate")` menembak
 * elemen yang sudah tidak ada sejak migrasi picker — helper ini satu-satunya
 * cara yang didukung untuk mengisinya dari E2E.
 */

const FULL_MONTH: Record<string, string> = {
  Jan: "Januari", Feb: "Februari", Mar: "Maret", Apr: "April", Mei: "Mei", Jun: "Juni",
  Jul: "Juli", Agu: "Agustus", Sep: "September", Okt: "Oktober", Nov: "November", Des: "Desember",
}

/**
 * Pilih bulan pada AppMonthPicker lewat opsi grid-nya (nama pendek, mis. "Sep").
 * Bulan di grid adalah <button> ber-aria-label "September 2026" (nama PENUH),
 * bukan role=option — dan grid baru ter-render lewat popover sesudah klik
 * pemicu, jadi tombolnya wajib ditunggu (klik option pernah timeout 30s di CI
 * lokal karena locator menembak elemen yang tak pernah ada).
 */
export async function pickMonth(page: Page, name: string, monthLabel: string): Promise<void> {
  const full = FULL_MONTH[monthLabel] ?? monthLabel
  await page.locator(`#${name}-trigger`).click()
  await page.getByRole("button", { name: new RegExp(`^${full} \\d{4}$`) }).click()
}

/**
 * Pilih tanggal pada AppDatePicker: buka kalender, maju `monthsForward` bulan
 * (relatif terhadap bulan yang sedang tampil — umumnya bulan berjalan),
 * lalu klik sel hari ISO `isoDate` (YYYY-MM-DD).
 */
export async function pickDate(page: Page, name: string, isoDate: string): Promise<void> {
  const [year, month] = isoDate.split("-").map(Number)
  const now = new Date()
  const monthsForward = (year - now.getFullYear()) * 12 + (month - (now.getMonth() + 1))
  if (monthsForward < 0) throw new Error(`pickDate: ${isoDate} sudah lewat dari bulan berjalan`)

  await page.locator(`#${name}-trigger`).click()
  const nextMonth = page.locator(".rdp-button_next, [aria-label='Go to the Next Month']").first()
  for (let i = 0; i < monthsForward; i++) {
    await nextMonth.click()
  }
  await page.locator(`[data-day="${isoDate}"] button`).first().click()
}
