import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

const TABLES = [
  "src/app/(dashboard)/kendaraan/_components/vehicle-table.tsx",
  "src/app/(dashboard)/kendaraan/pelanggan/_components/customer-vehicle-table.tsx",
  "src/app/(dashboard)/aset/_components/asset-table.tsx",
]

describe("tombol Detail baris tabel target sentuh 44px (360-430px)", () => {
  for (const rel of TABLES) {
    it(`${rel}: link Detail size-11, bukan size-8`, () => {
      const src = source(rel)
      const idx = Math.max(
        src.indexOf('aria-label="Detail"'),
        src.indexOf("aria-label={`Detail"),
      )
      expect(idx, "aria-label Detail tidak ditemukan").toBeGreaterThan(0)
      const window = src.slice(Math.max(0, idx - 500), idx)
      expect(window).toContain("size-11")
      expect(window).not.toContain("size-8")
    })
  }
})
