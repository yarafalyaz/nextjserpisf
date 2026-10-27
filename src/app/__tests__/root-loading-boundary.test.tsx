// @vitest-environment jsdom
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot } from "react-dom/client"
import { act } from "react"
import RootLoading from "../loading"

/**
 * Penjaga boundary loading akar (F-01 scan t_ddaee810).
 *
 * Memetakan tiap rute ke boundary `loading.tsx` terdekat menurut aturan
 * segmen Next.js (boundary segmen sendiri menang, lalu naik ke induk).
 * `src/app/loading.tsx` akar WAJIB menutup rute yang tidak punya boundary
 * sendiri — saat ini `/setup` dan dua halaman statis grup `(auth)`.
 * Rute dashboard/login TIDAK boleh kehilangan boundary spesifiknya
 * karena berkas akar ini.
 */
const APP_DIR = path.resolve(__dirname, "..")

/** Boundary loading terdekat untuk berkas halaman, relatif ke src/app. */
function nearestLoading(pageAbs: string): string | null {
  let dir = path.dirname(pageAbs)
  while (dir.startsWith(APP_DIR)) {
    const candidate = path.join(dir, "loading.tsx")
    if (fs.existsSync(candidate)) return path.relative(APP_DIR, candidate)
    if (dir === APP_DIR) break
    dir = path.dirname(dir)
  }
  return null
}

function pageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) pageFiles(child, out)
    else if (entry.name === "page.tsx") out.push(child)
  }
  return out
}

describe("boundary loading akar", () => {
  it("fallback akar mengumumkan status memuat ke pembaca layar", () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    act(() => {
      root.render(<RootLoading />)
    })
    const status = host.querySelector('[role="status"]')
    expect(status?.getAttribute("aria-label")).toBe("Memuat halaman")
    expect(status?.getAttribute("aria-busy")).toBe("true")
    act(() => root.unmount())
  })

  it("menutup /setup dan dua halaman statis (auth) yang tanpa boundary sendiri", () => {
    for (const page of ["setup/page.tsx", "(auth)/kebijakan-privasi/page.tsx", "(auth)/ketentuan-layanan/page.tsx"]) {
      expect(nearestLoading(path.join(APP_DIR, page)), page).toBe("loading.tsx")
    }
  })

  it("boundary spesifik dashboard dan login tetap yang terdekat, tidak tertutup akar", () => {
    expect(nearestLoading(path.join(APP_DIR, "(dashboard)/crm/page.tsx"))).toBe("(dashboard)/crm/loading.tsx")
    expect(nearestLoading(path.join(APP_DIR, "(auth)/login/page.tsx"))).toBe("(auth)/login/loading.tsx")
  })

  it("tidak ada halaman tanpa boundary loading sama sekali", () => {
    const pages = pageFiles(APP_DIR)
    expect(pages.length).toBeGreaterThan(100)
    const uncovered = pages.filter((page) => nearestLoading(page) === null)
    expect(uncovered.map((page) => path.relative(APP_DIR, page))).toEqual([])
  })
})
