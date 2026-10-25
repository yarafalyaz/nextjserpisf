import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * F-2026-10-25-012-S, AC-SR-F1: tombol "Selesaikan" retur penjualan hanya
 * boleh menawarkan aksi bagi pemegang izin `approve_sales_returns` menurut
 * payload server. UI tidak menilai status/SoD sendiri — gerbang server
 * (izin + status draft + SoD) tetap penjaga akhir.
 *
 * Dua permukaan existing:
 * - Halaman detail RSC wajib me-render tombol di balik
 *   `hasPermission("approve_sales_returns")` (payload izin server).
 * - Tabel daftar wajib meneruskan `processPermission="approve_sales_returns"`
 *   ke ActionDropdown (cek session.user.permissions dari server).
 *
 * Penjaga sumber: mencabut/mengganti kunci izin di salah satu permukaan
 * harus memerahkan tes ini (diverifikasi falsifikasi saat dibuat).
 */
const DETAIL_PAGE = path.join(
  process.cwd(),
  "src/app/(dashboard)/penjualan/retur/[slug]/page.tsx",
)
const RETURN_TABLE = path.join(
  process.cwd(),
  "src/app/(dashboard)/penjualan/retur/_components/return-table.tsx",
)

describe("AC-SR-F1 tombol Selesaikan retur penjualan sadar-izin", () => {
  const detailSource = fs.readFileSync(DETAIL_PAGE, "utf8")
  const tableSource = fs.readFileSync(RETURN_TABLE, "utf8")

  it("detail: izin dibaca dari payload server lewat hasPermission", () => {
    expect(detailSource).toContain('hasPermission("approve_sales_returns")')
  })

  it("detail: tombol Selesaikan hanya dirender bagi pemegang izin", () => {
    expect(detailSource).toContain('label="Selesaikan"')
    expect(detailSource).toMatch(/status !== "completed" && \w+ && \(\s*<ProcessButton/)
  })

  it("detail: UI tidak menilai pemisahan tugas sendiri (createdBy tidak dibandingkan di halaman)", () => {
    expect(detailSource).not.toContain("createdBy")
  })

  it("tabel: menu Selesaikan digerbang approve_sales_returns, bukan izin ubah", () => {
    expect(tableSource).toContain('processPermission="approve_sales_returns"')
    expect(tableSource).not.toContain('processPermission="edit_sales_returns"')
    expect(tableSource).toContain('processLabel="Selesaikan"')
  })
})
