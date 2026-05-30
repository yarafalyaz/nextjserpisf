import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"

function collectCreateRoutes(): string[] {
  const appDir = path.resolve(__dirname, "../src/app/(dashboard)")
  const routes = new Set<string>()

  function walk(dir: string, rel = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    const hasCreatePage = entries.some((e) => e.isDirectory() && e.name === "tambah")
    if (hasCreatePage) {
      const route = `/${rel}`.replace(/\/+/g, "/").replace(/\/$/, "")
      routes.add(route)
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith("_")) continue
      walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name)
    }
  }

  walk(appDir)

  return [...routes]
    .filter((r) => !r.includes("[id]"))
    .sort((a, b) => a.localeCompare(b))
}

const CRUD_BASE_ROUTES = collectCreateRoutes()

test.describe("CRUD surface smoke (all modules)", () => {
  for (const baseRoute of CRUD_BASE_ROUTES) {
    test(`module ${baseRoute}: list/read-create-update surface`, async ({ page }) => {
      test.setTimeout(90_000)
      // 1. LIST/READ surface
      await page.goto(baseRoute, { waitUntil: "domcontentloaded" })
      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i)

      // 2. CREATE surface
      await page.goto(`${baseRoute}/tambah`, { waitUntil: "domcontentloaded" })
      await expect(page).not.toHaveURL(/\/login/)

      const createSurface = page
        .locator("form:visible, input:visible, textarea:visible, select:visible, [role='textbox']:visible")
        .first()
      await expect(createSurface).toBeVisible()

      // 3. READ/UPDATE surface from first ID link if available
      await page.goto(baseRoute, { waitUntil: "domcontentloaded" })
      const detailLink = page.locator(`a[href^="${baseRoute}/"]`).filter({
        hasNotText: "tambah",
      }).first()

      const hasDetail = await detailLink.count()
      if (hasDetail > 0) {
        const href = await detailLink.getAttribute("href")
        if (href && !href.endsWith("/tambah")) {
          await page.goto(href, { waitUntil: "domcontentloaded" })
          await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i)

          const editHref = href.endsWith("/ubah") ? href : `${href}/ubah`
          await page.goto(editHref, { waitUntil: "domcontentloaded" })
          await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i)
        }
      }
    })
  }
})
