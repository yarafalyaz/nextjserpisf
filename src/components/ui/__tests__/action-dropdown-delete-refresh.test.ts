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

describe("ActionDropdown delete ber-alasan (regresi E2E uang muka/transfer bank/setor pajak)", () => {
  it("deleteReasonLabel: alasan dikumpulkan, divalidasi, dan dikirim ke deleteAction", () => {
    const src = source(ACTION_DROPDOWN)
    // Prop opsional ada; tanpa prop perilaku lama tak berubah.
    expect(src).toContain("deleteReasonLabel?: string")
    expect(src).toContain("deleteAction?: (id: number, reason?: string)")
    // Guard klien: alasan kosong tidak pernah mencapai server (server tetap pemilik validasi).
    expect(src).toContain('if (deleteReasonLabel && !deleteReason.trim())')
    expect(src).toContain('showError("Alasan pembatalan wajib diisi")')
    // Alasan ter-trim dikirim sebagai argumen kedua.
    expect(src).toContain("deleteReasonLabel ? deleteReason.trim() : undefined")
    // Field memakai ReasonField bersama, bukan salinan lokal.
    expect(src).toContain('from "@/components/ui/reason-field"')
    expect(src).toContain("<ReasonField")
  })

  it("ketiga tabel void finansial memasang deleteReasonLabel (aksinya menolak alasan kosong)", () => {
    for (const table of [
      "src/app/(dashboard)/keuangan/penyetoran-pajak/_components/tax-payment-table.tsx",
      "src/app/(dashboard)/pembelian/uang-muka/_components/purchase-advance-table.tsx",
      "src/app/(dashboard)/keuangan/transfer-bank/_components/bank-transfer-table.tsx",
    ]) {
      expect(source(table), table).toContain('deleteReasonLabel="Alasan pembatalan"')
    }
  })
})
