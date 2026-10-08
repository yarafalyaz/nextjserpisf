import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"

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
        walk(path.join(current, entry.name), rel ? `${rel}/${entry.name}` : entry.name)
      } else if (entry.name === "page.tsx" && rel) {
        routes.push(`/laporan/${rel}`)
      }
    }
  }

  walk(dir)
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

test.describe("Laporan — legacy redirects", () => {
  test("anggaran-vs-aktual redirects to anggaran-vs-realisasi", async ({ page }) => {
    await page.goto("/laporan/anggaran-vs-aktual", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/laporan\/anggaran-vs-realisasi$/)
  })
})

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

      const body = (await page.locator("body").innerText()).toLowerCase()
      for (const marker of ERROR_MARKERS) {
        expect(body, `must not show "${marker}"`).not.toContain(marker.toLowerCase())
      }
      if (mode === "income-statement") {
        // The carve-out must be present: gross profit line proves HPP was split
        // out of operating expense rather than lumped together.
        expect(body).toContain("laba kotor")
      } else {
        expect(body).toContain("neraca saldo")
      }
    })
  }
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
    })
  }
})
