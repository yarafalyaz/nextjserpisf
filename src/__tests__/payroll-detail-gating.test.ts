import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Gerbang izin tombol Finalisasi/Bayar di detail slip (temuan 5 round2):
 * user view-only (view_payroll tanpa process_payroll) tidak boleh melihat
 * tombol yang aksi servernya pasti menolak. Pola PKWT panel: izin dihitung
 * server di halaman, tombol hanya render bila lolos.
 */
const source = readFileSync(
  join(process.cwd(), "src/app/(dashboard)/sdm/penggajian/[slug]/page.tsx"),
  "utf8",
)

describe("detail slip — gerbang process_payroll", () => {
  it("izin process_payroll dihitung di server halaman", () => {
    expect(source).toMatch(/hasPermission\("process_payroll"\)/)
  })

  it("tombol Finalisasi hanya tampil bila canProcessPayroll", () => {
    expect(source).toMatch(/canProcessPayroll && <ApprovePayrollButton/)
  })

  it("tombol Bayar hanya tampil bila canProcessPayroll", () => {
    expect(source).toMatch(/canProcessPayroll && \(\s*<MarkPaidPayrollButton/)
  })

  it("tombol Koreksi hanya tampil untuk slip paid bila canProcessPayroll", () => {
    expect(source).toMatch(
      /payroll\.status === "paid" && canProcessPayroll && \(\s*<CorrectPaidPayrollButton/,
    )
  })
})
