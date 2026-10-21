// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { LaborRecapCard } from "../labor-recap-card"
import { buildLaborRecap } from "@/lib/reports/labor-recap"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("LaborRecapCard F-2026-10-20-97a", () => {
  it("render teknisi, kelompok tanpa teknisi, total, dan notice apa adanya", () => {
    const recap = buildLaborRecap([
      { employeeId: 7, employeeName: "Budi", category: "labor", hours: 8, amount: 500_000 },
      { employeeId: 7, employeeName: "Budi", category: "labor", hours: 4, amount: 250_000 },
      { employeeId: null, employeeName: null, category: "labor", hours: 2, amount: 100_000 },
      { employeeId: 9, employeeName: null, category: "machine", hours: 1, amount: 999_999 },
    ])
    const { container, root } = renderCard(<LaborRecapCard recap={recap} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Rekap Borongan Teknisi"]')).not.toBeNull()
    expect(text).toContain("Budi")
    expect(text).toContain("Rp 750.000")
    // baris tanpa sumber tampil tanpa nama — teknisi tidak ditebak
    expect(text).toContain("Tanpa teknisi")
    expect(text).not.toContain("999.999")
    // notice backend tampil apa adanya, tanpa tombol bayar
    expect(text).toContain("bukan dasar pembayaran")
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })

  it("keadaan kosong tampil pesan, bukan tabel", () => {
    const recap = buildLaborRecap([])
    const { container, root } = renderCard(<LaborRecapCard recap={recap} />)
    expect(container.textContent ?? "").toContain("Belum ada baris biaya labor")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })

  it("F-038: kelompok tanggal belum terbukti tampil di luar total, total tidak berubah", () => {
    const base = buildLaborRecap([
      { employeeId: 7, employeeName: "Budi", category: "labor", hours: 8, amount: 500_000 },
    ])
    const recap = {
      ...base,
      undated: { laborHours: 3, totalAmount: 120_000, lineCount: 2 },
    } as typeof base & { undated: { laborHours: number; totalAmount: number; lineCount: number } }
    const { container, root } = renderCard(<LaborRecapCard recap={recap} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Baris labor tanggal kerja belum terbukti"]')).not.toBeNull()
    expect(text).toContain("Tanggal kerja belum terbukti")
    expect(text).toContain("di luar total periode")
    expect(text).toContain("Rp 120.000")
    // total periode tetap 500rb — undated tidak masuk total
    expect(text).toContain("total Rp 500.000")
    unmountCard(root)
  })

  it("F-038: tanpa kelompok undated, bagian tanggal tidak tampil", () => {
    const recap = buildLaborRecap([
      { employeeId: 7, employeeName: "Budi", category: "labor", hours: 8, amount: 500_000 },
    ])
    const { container, root } = renderCard(<LaborRecapCard recap={recap} />)
    expect(container.querySelector('[aria-label="Baris labor tanggal kerja belum terbukti"]')).toBeNull()
    expect(container.textContent ?? "").not.toContain("Tanggal kerja belum terbukti")
    unmountCard(root)
  })
})
