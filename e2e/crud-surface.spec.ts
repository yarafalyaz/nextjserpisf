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
      await expect(createSurface).toBeVisible({ timeout: 30000 })

      // 3. READ/UPDATE surface from first ID link if available
      await page.goto(baseRoute, { waitUntil: "domcontentloaded" })
      const detailLinks = page.locator(`a[href^="${baseRoute}/"]`).filter({
        hasNotText: /tambah/i,
      })

      const linkCount = await detailLinks.count()
      for (let i = 0; i < linkCount; i++) {
        const candidateHref = await detailLinks.nth(i).getAttribute("href")
        if (!candidateHref) continue
        if (candidateHref.includes("/tambah")) continue

        const basePattern = new RegExp(`^${baseRoute}/[^/]+(?:/ubah)?$`)
        if (!basePattern.test(candidateHref)) continue

        await page.goto(candidateHref, { waitUntil: "domcontentloaded" })
        await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i)

        const editHref = candidateHref.endsWith("/ubah") ? candidateHref : `${candidateHref}/ubah`
        await page.goto(editHref, { waitUntil: "domcontentloaded" })
        await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i)
        break
      }
    })
  }
})
