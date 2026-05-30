import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"

function collectDashboardRoutes(): string[] {
  const appDir = path.resolve(__dirname, "../src/app/(dashboard)")
  const routes = new Set<string>()

  function walk(dir: string, rel = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    const hasPage = entries.some((e) => e.isFile() && e.name === "page.tsx")
    if (hasPage) {
      const route = `/${rel}`.replace(/\/+/g, "/")
      routes.add(route === "/" ? "/" : route.replace(/\/$/, ""))
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith("_")) continue
      if (entry.name.startsWith("[")) continue // skip dynamic segments
      walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name)
    }
  }

  walk(appDir)

  return [...routes]
    .filter((r) => r !== "/")
    .sort((a, b) => a.localeCompare(b))
}

test.describe("System-wide smoke test (all static dashboard pages)", () => {
  const routes = collectDashboardRoutes()

  for (const route of routes) {
    test(`load ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" })
      await expect(page.locator("body")).toBeVisible()

      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i)
    })
  }
})
