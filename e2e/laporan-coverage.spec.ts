import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { skipOnMobile } from "./utils/desktop-only"

/**
 * Walks every page under `src/app/(dashboard)/laporan` and asserts it renders
 * for real — not the login screen, not the error boundary. This is the guard
 * against the failure mode we hit here: a report page existing on disk but
 * being unreachable / broken because nothing links to it or its query crashes.
 */
function collectReportRoutes(): string[] {
  const dir = path.resolve(__dirname, "../src/app/(dashboard)/laporan")
  const routes: string[] = []

  function walk(current: string, rel = "") {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_")) continue
        // Setiap laporan menaruh `page.tsx` di dalam `[[...segments]]` (periode
        // dan filter ada di path), dan alamat tanpa periode tetap folder
        // induknya — jadi segmen ini tidak ikut membentuk URL. Tanpa perlakuan
        // ini seluruh halaman laporan hilang dari cakupan spec secara diam-diam.
        const next =
          entry.name === "[[...segments]]" ? rel : rel ? `${rel}/${entry.name}` : entry.name
        walk(path.join(current, entry.name), next)
      } else if (entry.name === "page.tsx" && rel) {
        routes.push(`/laporan/${rel}`)
      }
    }
  }

  walk(dir)
  // Rute entitas ber-`[slug]` tidak punya alamat tetap, jadi tetap dilewati.
  return routes.filter((r) => !r.includes("[")).sort((a, b) => a.localeCompare(b))
}

const REPORT_ROUTES = collectReportRoutes()

// A failed report render surfaces one of these markers in the error boundary
// (`laporan/error.tsx`) or Next's dev overlay.
const ERROR_MARKERS = [
  "Something went wrong",
  "Terjadi kesalahan",
  "Application error",
  "Internal Server Error",
  "Unhandled Runtime Error",
]


// The legacy combined /laporan/keuangan page switches mode via ?report=. The
// route walker only hits the default, so exercise BOTH modes here: the income
// statement branch must render the multi-step shell (HPP / LABA KOTOR) that the
// old naive sum omitted.
test.describe("Laporan — keuangan combined modes", () => {
  for (const mode of ["trial-balance", "income-statement"]) {
    test(`renders /laporan/keuangan?report=${mode}`, async ({ page }) => {
      test.setTimeout(60_000)
      const response = await page.goto(`/laporan/keuangan?report=${mode}`, { waitUntil: "domcontentloaded" })
      await expect(page).not.toHaveURL(/\/login/)
      expect(response?.status() ?? 200).toBeLessThan(400)

      // Auto-retrying assertions: a one-shot `innerText()` read races the report
      // render under parallel load and produced a spurious "laba kotor" failure
      // (the page had streamed only the shell). Matching the live text retries
      // until the report body is actually there.
      const body = page.locator("body")
      for (const marker of ERROR_MARKERS) {
        await expect(body, `must not show "${marker}"`).not.toContainText(new RegExp(marker, "i"))
      }
      if (mode === "income-statement") {
        // The carve-out must be present: gross profit line proves HPP was split
        // out of operating expense rather than lumped together.
        await expect(body).toContainText(/laba kotor/i, { timeout: 15_000 })
      } else {
        await expect(body).toContainText(/neraca saldo/i, { timeout: 15_000 })
      }
    })
  }
})

test.describe("Laporan — URL: periode dan filter ada di path", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Perilaku URL laporan khusus desktop")
  })

  test("slug periode menentukan periode yang ditampilkan", async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto("/laporan/pajak/2026-10", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/31 oktober 2026/i, { timeout: 15_000 })
  })

  test("tautan lama (?tanggalMulai=) menampilkan periode yang sama", async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto("/laporan/pajak?tanggalMulai=2026-01-01&tanggalSelesai=2026-10-13", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/1 januari 2026/i, { timeout: 15_000 })
  })

  // Regresi yang dijaga: tombol Tampilkan dulu menulis query string
  // (`?tanggalMulai=…`). Kalau ada yang mengembalikannya, alamatnya jadi kotor
  // lagi tanpa satu pun unit test gagal.
  test("Tampilkan menghasilkan alamat path tanpa query string", async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto("/laporan/mutasi-stok/2026-10", { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Tampilkan" }).click()
    await expect(page).toHaveURL(/\/laporan\/mutasi-stok\/\d{4}-\d{2}(-\d{2})?$/, { timeout: 15_000 })
    expect(new URL(page.url()).search).toBe("")
  })

  test("filter di path terbaca kembali oleh halaman", async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto("/laporan/kartu-stok/2026-10/gudang/gudang-utama", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("combobox", { name: /gudang/i })).toContainText(/gudang utama/i, { timeout: 15_000 })
  })
})

test.describe("Laporan — every report page renders", () => {
  test("there is at least one report route to check", () => {
    expect(REPORT_ROUTES.length).toBeGreaterThan(0)
  })

  for (const route of REPORT_ROUTES) {
    test(`renders ${route}`, async ({ page }) => {
      test.setTimeout(60_000)
      const response = await page.goto(route, { waitUntil: "domcontentloaded" })

      // Not bounced to login (auth works) and not a framework error page.
      await expect(page).not.toHaveURL(/\/login/)
      expect(response?.status() ?? 200, `${route} HTTP status`).toBeLessThan(400)

      const body = (await page.locator("body").innerText()).toLowerCase()
      for (const marker of ERROR_MARKERS) {
        expect(body, `${route} must not show "${marker}"`).not.toContain(marker.toLowerCase())
      }

      // The report heading / breadcrumb "Laporan" must be present so we know it
      // actually rendered the report shell rather than a blank/broken shell.
      await expect(page.locator("body")).toContainText(/laporan/i)

      // Kerangka seragam: seluruh halaman laporan dirender di dalam
      // `ReportPageShell` (remah → parameter → aksi → lembar). Dulu 23 halaman
      // menyusun remah/kopnya sendiri sehingga tampil beda-beda.
      await expect(page.locator(".report-page-shell")).toHaveCount(1)
      // Tepat SATU remah yang terlihat: kalau ada halaman yang masih menulis
      // remahnya sendiri, dua remah akan tampil bertumpuk.
      // (`:visible` penting — Next menyisakan salinan tersembunyi sisa streaming
      // untuk segmen yang punya `loading.tsx`, dan itu bukan remah dobel.)
      await expect(page.locator('nav[aria-label="Navigasi breadcrumb"]:visible')).toHaveCount(1)
    })
  }
})

test.describe("Laporan — kerangka seragam (shell, urutan, dan cetak)", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Pemeriksaan layout & cetak khusus desktop")
  })

  // Sampel yang mewakili bentuk berbeda: statement (laba-rugi), laporan berkop
  // lebar (pajak), laporan proyek, dan analisis multi-sumber.
  for (const route of ["/laporan/laba-rugi", "/laporan/pajak", "/laporan/laba-rugi-proyek", "/laporan/analisis-harga-beli"]) {
    test(`filter & aksi berada di atas lembar: ${route}`, async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(route, { waitUntil: "domcontentloaded" })

      const controls = page.locator('[role="group"][aria-label="Ekspor dokumen"]').first()
      const sheet = page.locator(".report-sheet, .report-letterhead").first()
      await expect(controls).toBeVisible()
      await expect(sheet).toBeVisible()

      // Urutan visual: kontrol di ATAS lembar, bukan tercampur ke dalam isinya.
      const controlsBox = await controls.boundingBox()
      const sheetBox = await sheet.boundingBox()
      expect(controlsBox, "kontrol ekspor punya kotak").not.toBeNull()
      expect(sheetBox, "lembar laporan punya kotak").not.toBeNull()
      expect(controlsBox!.y).toBeLessThan(sheetBox!.y)

      // Kanvas dokumen: di layar berlatar gelap (kertas terbaca sebagai dokumen)…
      const canvas = page.locator(".report-canvas").first()
      await expect(canvas).toBeVisible()
      const screenBackground = await canvas.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(screenBackground).not.toBe("rgba(0, 0, 0, 0)")

      // Saat dicetak: kontrol hilang, kanvas jadi tembus pandang, lembar tetap tercetak.
      await page.emulateMedia({ media: "print" })
      await expect(controls).toBeHidden()
      await expect(page.locator('[role="search"]').first()).toBeHidden()
      await expect(sheet).toBeVisible()
      const printBackground = await canvas.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(printBackground).toBe("rgba(0, 0, 0, 0)")
      await page.emulateMedia({ media: "screen" })
    })
  }
})
