// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"

import {
  DisciplinaryDeductionDecisionsCard,
  DisciplinaryDeductionRecordContext,
} from "../disciplinary-deduction-decisions-card"
import { renderCard, unmountCard } from "./card-test-utils"
import type { DisciplinaryDeductionDecisionRow } from "@/lib/reports/disciplinary-deduction-data"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((r) => unmountCard(r))
  roots = []
  document.body.replaceChildren()
})

function decision(over: Partial<DisciplinaryDeductionDecisionRow> = {}): DisciplinaryDeductionDecisionRow {
  return {
    id: 7,
    documentNo: "KEP-001/2026",
    decidedAt: new Date("2026-10-10T00:00:00.000Z"),
    employeeId: 42,
    employeeName: "Budi Santoso",
    departmentName: "Bengkel",
    disciplinaryRecordId: 5,
    contextDocumentNo: "001/SP/YRA/10/2026",
    kind: "ganti_rugi",
    amount: 250000,
    compensationAccountLabel: "510099 — Kompensasi Lain",
    suspensionKind: "disiplin",
    suspensionPayTreatment: "tidak_dibayar",
    regulationReference: "PP Bab V Pasal 12",
    signerName: "Direktur",
    ...over,
  }
}

describe("DisciplinaryDeductionDecisionsCard BR-DISC-09", () => {
  it("snapshot verbatim: nominal, jenis, perlakuan upah, dasar tampil apa adanya", () => {
    const { container, root } = renderCard(
      <DisciplinaryDeductionDecisionsCard decisions={[decision()]} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("KEP-001/2026")
    expect(text).toContain("Rp 250.000,00")
    expect(text).toContain("ganti_rugi")
    expect(text).toContain("tidak_dibayar")
    expect(text).toContain("PP Bab V Pasal 12")
    expect(text).toContain("510099 — Kompensasi Lain")
    expect(text).toContain("001/SP/YRA/10/2026")
    expect(text).toContain("Surat peringatan tidak memicu potongan")
    const headers = [...container.querySelectorAll("th")].map((th) => th.textContent)
    expect(headers).toEqual([
      "Nomor Dokumen",
      "Tanggal Keputusan",
      "Karyawan",
      "Jenis Potongan",
      "Nominal Keputusan",
      "Skorsing",
      "Perlakuan Upah",
      "Dasar Peraturan",
      "Akun Kompensasi",
      "Konteks SP",
      "Ditandatangani Oleh",
    ])
  })

  it("tanpa izin nominal: status eksplisit tampil, angka nominal tidak ada", () => {
    const { container, root } = renderCard(
      <DisciplinaryDeductionDecisionsCard decisions={[decision({ amount: null })]} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("Nominal tidak ditampilkan — tanpa izin lihat payroll")
    expect(text).not.toContain("Rp 250.000")
  })

  it("kosong tampil empty state tanpa tabel", () => {
    const { container, root } = renderCard(<DisciplinaryDeductionDecisionsCard decisions={[]} />)
    roots.push(root)
    expect(container.textContent).toContain(
      "Belum ada dokumen keputusan potongan disiplin dalam cakupan Anda",
    )
    expect(container.querySelector("table")).toBeNull()
  })

  it("konteks SP: snapshot tampil dengan penanda konteks saja; kosong = tidak render", () => {
    const { container, root } = renderCard(
      <DisciplinaryDeductionRecordContext decisions={[decision()]} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("konteks saja — surat peringatan tidak memicu")
    expect(text).toContain("Rp 250.000,00")

    const empty = renderCard(<DisciplinaryDeductionRecordContext decisions={[]} />)
    roots.push(empty.root)
    expect(empty.container.textContent ?? "").not.toContain("Keputusan Potongan Terkait")
  })
})
