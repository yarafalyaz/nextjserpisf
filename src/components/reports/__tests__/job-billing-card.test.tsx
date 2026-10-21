// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { createRoot } from "react-dom/client"
import { act } from "react"
import { JobBillingCard } from "../job-billing-card"
import type { JobBillingSummaryResult } from "@/lib/reports/job-billing-summary-data"

const base: JobBillingSummaryResult = {
  quotationId: 9,
  quotationDocumentNo: "Q-009",
  nilaiBerjalan: 1_000_000,
  sudahDitagih: 400_000,
  sudahDibayar: 150_000,
  sisaBelumDitagih: 600_000,
  sisaBelumDibayar: 250_000,
  uangMukaDiterima: 500_000,
  ambangInvoice: 500_000,
  jarakKeAmbangInvoice: 0,
  ambangInvoiceTercapai: true,
  kreditTerbuka: 0,
  sisaEfektif: 250_000,
  openCredits: [],
  overbilled: false,
  billedInvoices: [{ id: 1, documentNo: "INV-1", status: "posted", grandTotal: 400_000, paidAmount: 150_000 }],
  workOrders: [{ id: 5, documentNo: "WO-5", projectId: null }],
}

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { container, root }
}

describe("JobBillingCard F-2026-10-21-107 delta nilai termin", () => {
  it("tanpa prop: fallback tak tercatat, daftar termin tidak tampil", () => {
    const { container, root } = render(<JobBillingCard summary={base} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Perubahan nilai sejak snapshot tidak tercatat")
    expect(container.querySelector('[aria-label="Delta nilai termin"]')).toBeNull()
    expect(text).not.toMatch(/Termin 1|Termin 2|jadwal kontraktual resmi/i)
    act(() => root.unmount()); container.remove()
  })

  it("deltaCents null: fallback tak tercatat, daftar termin tidak tampil", () => {
    const { container, root } = render(<JobBillingCard summary={base} deltaNilaiCents={null} />)
    expect(container.textContent).toContain("Perubahan nilai sejak snapshot tidak tercatat")
    expect(container.querySelector('[aria-label="Delta nilai termin"]')).toBeNull()
    act(() => root.unmount()); container.remove()
  })

  it("delta 0: fallback tak tercatat, daftar termin tidak tampil", () => {
    const { container, root } = render(<JobBillingCard summary={base} deltaNilaiCents={0} />)
    expect(container.textContent).toContain("Perubahan nilai sejak snapshot tidak tercatat")
    expect(container.querySelector('[aria-label="Delta nilai termin"]')).toBeNull()
    act(() => root.unmount()); container.remove()
  })

  it("naik: +Rp 100.000 (11,1% dari snapshot Rp 900.000), teks sisa tagih bertambah, label kejujuran persis", () => {
    const { container, root } = render(<JobBillingCard summary={base} deltaNilaiCents={10_000_000} />)
    const block = container.querySelector('[aria-label="Delta nilai termin"]')
    expect(block).not.toBeNull()
    const text = block?.textContent ?? ""
    expect(text).toContain("Delta turunan dari snapshot, bukan amendemen jadwal")
    expect(text).toContain("Nilai naik — sisa tagih bertambah")
    expect(text).toContain("+Rp 100.000 (11,1%)")
    expect(text).toContain("Sisa belum ditagih kini")
    act(() => root.unmount()); container.remove()
  })
})

describe("JobBillingCard F-2026-10-21-106 progres termin turunan", () => {
  it("progres tampil persen+nominal benar + label kejujuran persis", () => {
    const { container, root } = render(<JobBillingCard summary={base} />)
    const block = container.querySelector('[aria-label="Progres termin turunan"]')
    expect(block).not.toBeNull()
    const text = block?.textContent ?? ""
    expect(text).toContain("Turunan posisi berjalan, bukan jadwal kontraktual")
    expect(text).toContain("DP terkonfirmasi dari nilai berjalan")
    expect(text).toContain("50,0%")
    expect(text).toContain("Rp 500.000")
    expect(text).toContain("Tertagih dari nilai berjalan")
    expect(text).toContain("40,0%")
    expect(text).toContain("Rp 400.000")
    expect(text).toContain("Sisa belum ditagih dari nilai berjalan")
    expect(text).toContain("60,0%")
    expect(text).toContain("Rp 600.000")
    expect(text).not.toMatch(/Termin 1|Termin 2|pelunasan kontraktual/i)
    act(() => root.unmount()); container.remove()
  })
})

describe("JobBillingCard F-2026-10-21-107 delta nilai termin (turun)", () => {
  it("turun: −Rp 100.000, teks kredit pelanggan, warna hijau, nominal absolut", () => {
    const { container, root } = render(<JobBillingCard summary={base} deltaNilaiCents={-10_000_000} />)
    const block = container.querySelector('[aria-label="Delta nilai termin"]')
    const text = block?.textContent ?? ""
    expect(text).toContain("Nilai turun — kelebihan menjadi kredit pelanggan")
    expect(text).toContain("−Rp 100.000")
    expect(text).not.toContain("+Rp 100.000")
    expect(text).toContain("Rp 100.000")
    act(() => root.unmount()); container.remove()
  })

  it("snapshot lama 0: persen null, nominal tetap tampil tanpa NaN/Infinity", () => {
    const { container, root } = render(<JobBillingCard summary={{ ...base, nilaiBerjalan: 0, sudahDitagih: 0, sisaBelumDitagih: 0 }} deltaNilaiCents={10_000_000} />)
    const block = container.querySelector('[aria-label="Delta nilai termin"]')
    const text = block?.textContent ?? ""
    expect(text).toContain("+Rp 100.000")
    expect(text).not.toContain("NaN")
    expect(text).not.toContain("Infinity")
    expect(text).not.toContain("%")
    act(() => root.unmount()); container.remove()
  })

  it("sisa negatif: formatCurrency apa adanya, tidak clamp", () => {
    const { container, root } = render(
      <JobBillingCard summary={{ ...base, sisaBelumDitagih: -50_000 }} deltaNilaiCents={5_000_000} />,
    )
    const block = container.querySelector('[aria-label="Delta nilai termin"]')
    const text = block?.textContent ?? ""
    expect(text).toContain("Rp -50.000")
    expect(text).not.toContain("NaN")
    act(() => root.unmount()); container.remove()
  })
})

describe("JobBillingCard F-2026-10-21-106 progres termin turunan (nol & overbilled)", () => {
  it("nilaiBerjalan=0: tanpa NaN/Infinity, baris nominal saja", () => {
    const zero: JobBillingSummaryResult = { ...base, nilaiBerjalan: 0, sudahDitagih: 0, sudahDibayar: 0, sisaBelumDitagih: 0, sisaBelumDibayar: 0, uangMukaDiterima: 0, ambangInvoice: 0, jarakKeAmbangInvoice: 0, ambangInvoiceTercapai: false, sisaEfektif: 0, billedInvoices: [] }
    const { container, root } = render(<JobBillingCard summary={zero} />)
    const block = container.querySelector('[aria-label="Progres termin turunan"]')
    expect(block).not.toBeNull()
    const text = block?.textContent ?? ""
    expect(text).not.toContain("NaN")
    expect(text).not.toContain("Infinity")
    expect(text).not.toContain("%")
    expect(text).toContain("Rp 0")
    act(() => root.unmount()); container.remove()
  })

  it("overbilled: persen tertagih di-clamp 100, nominal + alert tetap", () => {
    const over: JobBillingSummaryResult = { ...base, sudahDitagih: 1_200_000, sisaBelumDitagih: -200_000, overbilled: true }
    const { container, root } = render(<JobBillingCard summary={over} />)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Overbilled")
    const block = container.querySelector('[aria-label="Progres termin turunan"]')
    const text = block?.textContent ?? ""
    expect(text).toContain("100,0%")
    expect(text).not.toContain("120,0%")
    expect(text).toContain("Rp 1.200.000")
    expect(text).toContain("Rp -200.000")
    expect(text).not.toContain("-20,0%")
    act(() => root.unmount()); container.remove()
  })
})

describe("JobBillingCard F-2026-10-20-43 kredit terbuka", () => {
  it("kreditTerbuka 0: baris kredit + sisa efektif + daftar kredit tidak tampil, sisa existing utuh", () => {
    const { container, root } = render(<JobBillingCard summary={base} />)
    const text = container.textContent ?? ""
    expect(text).not.toContain("Kredit terbuka")
    expect(text).not.toContain("Sisa efektif")
    expect(container.querySelector('[aria-label="Kredit terbuka"]')).toBeNull()
    expect(text).toContain("Sisa belum dibayar")
    act(() => root.unmount()); container.remove()
  })

  it("kreditTerbuka > 0: baris Kredit terbuka (bukan tagihan) + Sisa efektif + daftar per dokumen tampil", () => {
    const withCredit: JobBillingSummaryResult = {
      ...base,
      kreditTerbuka: 100_000,
      sisaEfektif: 150_000,
      openCredits: [
        { id: 3, documentNo: "CR-3", saldo: 60_000 },
        { id: 1, documentNo: "CR-1", saldo: 40_000 },
      ],
    }
    const { container, root } = render(<JobBillingCard summary={withCredit} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Kredit terbuka (bukan tagihan)")
    expect(text).toContain("Sisa efektif")
    const list = container.querySelector('[aria-label="Kredit terbuka"]')
    expect(list).not.toBeNull()
    expect(list?.textContent).toContain("CR-3")
    expect(list?.textContent).toContain("CR-1")
    expect(text).toContain("Sisa belum dibayar")
    expect(text).toContain("Sisa belum ditagih")
    act(() => root.unmount()); container.remove()
  })
})

describe("JobBillingCard F-2026-10-20-60 jarak ambang invoice", () => {
  it("belum tercapai: baris Kekurangan DP menuju invoice tampil, teks tercapai tidak", () => {
    const below: JobBillingSummaryResult = { ...base, uangMukaDiterima: 300_000, jarakKeAmbangInvoice: 200_000, ambangInvoiceTercapai: false }
    const { container, root } = render(<JobBillingCard summary={below} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Kekurangan DP menuju invoice")
    expect(text).not.toContain("Ambang invoice konversi DP tercapai")
    act(() => root.unmount()); container.remove()
  })
  it("tercapai: teks ambang tercapai tampil, baris kekurangan tidak", () => {
    const { container, root } = render(<JobBillingCard summary={base} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Ambang invoice konversi DP tercapai")
    expect(text).not.toContain("Kekurangan DP menuju invoice")
    act(() => root.unmount()); container.remove()
  })
})

describe("JobBillingCard F-2026-10-20-03", () => {
  it("render enam angka read-model + invoice + link WO", () => {
    const { container, root } = render(<JobBillingCard summary={base} />)
    const text = container.textContent ?? ""
    for (const label of ["Nilai berjalan", "Sudah ditagih", "Sudah dibayar", "Sisa belum ditagih", "Sisa belum dibayar", "Uang muka diterima"]) {
      expect(text).toContain(label)
    }
    expect(text).toContain("INV-1")
    expect(container.querySelector('a[href="/produksi/perintah-kerja/5"]')?.textContent).toBe("WO-5")
    expect(container.querySelector('[role="alert"]')).toBeNull()
    act(() => root.unmount()); container.remove()
  })

  it("overbilled tampil role=alert; tanpa invoice tampil teks kosong", () => {
    const over: JobBillingSummaryResult = { ...base, sudahDitagih: 1_200_000, sisaBelumDitagih: -200_000, overbilled: true, billedInvoices: [], workOrders: [] }
    const { container, root } = render(<JobBillingCard summary={over} />)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Overbilled")
    expect(container.textContent).toContain("Belum ada invoice posted")
    act(() => root.unmount()); container.remove()
  })
})
