import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ACTION_DROPDOWN = "src/components/ui/action-dropdown.tsx"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("ActionDropdown delete me-refresh daftar (regresi E2E kelompok pajak/pusat biaya)", () => {
  it("handleDelete memanggil router.refresh() sesudah sukses", () => {
    const src = source(ACTION_DROPDOWN)
    const start = src.indexOf("function handleDelete()")
    expect(start, "handleDelete tidak ditemukan").toBeGreaterThanOrEqual(0)
    const body = src.slice(start, src.indexOf("}", src.indexOf("setIsDeleteOpen(false)", start)))
    expect(body).toContain("router.refresh()")
    // refresh hanya sesudah toast sukses, bukan di jalur error.
    expect(body.indexOf('showSuccess("Data berhasil dihapus")')).toBeLessThan(body.indexOf("router.refresh()"))
  })
})
