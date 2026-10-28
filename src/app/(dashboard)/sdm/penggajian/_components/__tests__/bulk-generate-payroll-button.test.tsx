// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const generateBulkPayroll = vi.fn()
const showSuccess = vi.fn()
const showError = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/hrm.actions", () => ({
  generateBulkPayroll: (...args: unknown[]) => generateBulkPayroll(...args),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: (...args: unknown[]) => showSuccess(...args),
  showError: (...args: unknown[]) => showError(...args),
}))

vi.mock("@/components/ui/month-picker", () => ({
  AppMonthPicker: (p: { label?: string; name: string; value?: string; onChange?: (v: string) => void }) => (
    <div>
      <label htmlFor={`${p.name}-test`}>{p.label}</label>
      <input id={`${p.name}-test`} value={p.value ?? ""} onChange={(e) => p.onChange?.(e.target.value)} />
    </div>
  ),
}))

vi.mock("@/components/ui/date-picker", () => ({
  AppDatePicker: (p: { label?: string; name: string; value?: string; onChange?: (v: string) => void }) => (
    <div>
      <label htmlFor={`${p.name}-test`}>{p.label}</label>
      <input id={`${p.name}-test`} value={p.value ?? ""} onChange={(e) => p.onChange?.(e.target.value)} />
    </div>
  ),
}))

import { mount, act } from "@/components/payroll/__tests__/mount"
import type { Root } from "react-dom/client"
import { BulkGeneratePayrollButton } from "../bulk-generate-payroll-button"
import {
  mondayOnOrBefore,
  payrollRunSkipLines,
  weeklyEndFromStart,
  weeklyPeriodFromEndDate,
} from "../bulk-payroll-run-helpers"

const roots: Root[] = []

function renderButton(): HTMLElement {
  const { container, root } = mount(<BulkGeneratePayrollButton cutoffDay={25} />)
  roots.push(root)
  return container
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

function dialogText(): string {
  return document.body.textContent ?? ""
}

function openDialog(container: HTMLElement) {
  const trigger = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Buat Gaji Bulanan"),
  )
  if (!trigger) throw new Error("tombol buka dialog tidak ditemukan")
  click(trigger)
}

function radioByText(text: string): HTMLButtonElement {
  const el = Array.from(document.body.querySelectorAll('[role="radio"]')).find(
    (b) => b.textContent?.trim() === text,
  )
  if (!el) throw new Error(`radio ${text} tidak ditemukan`)
  return el as HTMLButtonElement
}

function submitButton(): HTMLButtonElement {
  const el = Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Mulai Buat",
  )
  if (!el) throw new Error("tombol Mulai Buat tidak ditemukan")
  return el as HTMLButtonElement
}

beforeEach(() => {
  vi.clearAllMocks()
  generateBulkPayroll.mockResolvedValue({
    success: true,
    count: 3,
    skippedTotal: 0,
    skippedByReason: { frekuensiLain: 0, pinjaman: 0, bpjsBelumDidukung: 0, plafonPotongan: 0, irisan: 0, berhenti: 0, cakupan: 0 },
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount())
  }
  document.body.innerHTML = ""
})

describe("helper run mingguan (murni, tanpa hitung payroll)", () => {
  it("period = YYYY-MM bulan tanggal selesai; lintas bulan ikut selesai", () => {
    expect(weeklyPeriodFromEndDate("2026-11-01")).toBe("2026-11")
    expect(weeklyPeriodFromEndDate("2026-10-25")).toBe("2026-10")
    expect(weeklyPeriodFromEndDate("")).toBe("")
    expect(weeklyPeriodFromEndDate("bukan-tanggal")).toBe("")
  })

  it("selesai turunan = mulai + 6 hari (jendela 7 hari mulai Senin)", () => {
    // 2026-10-26 = Senin.
    expect(weeklyEndFromStart("2026-10-26")).toBe("2026-11-01")
    expect(weeklyEndFromStart("2026-10-05")).toBe("2026-10-11")
    expect(weeklyEndFromStart("")).toBe("")
  })

  it("Senin pada/sebelum tanggal: Senin tetap, hari lain mundur ke Senin", () => {
    expect(mondayOnOrBefore("2026-10-26")).toBe("2026-10-26") // Senin
    expect(mondayOnOrBefore("2026-10-29")).toBe("2026-10-26") // Kamis
    expect(mondayOnOrBefore("2026-11-01")).toBe("2026-10-26") // Minggu
  })

  it("baris terlewati: label verbatim kontrak server, hanya alasan > 0, urutan tetap", () => {
    const lines = payrollRunSkipLines({
      frekuensiLain: 2,
      pinjaman: 1,
      bpjsBelumDidukung: 4,
      plafonPotongan: 6,
      irisan: 0,
      berhenti: 3,
      cakupan: 0,
    })
    expect(lines).toEqual([
      { reason: "frekuensiLain", label: "Frekuensi bayar berbeda", count: 2 },
      { reason: "pinjaman", label: "Pinjaman aktif — cicilan mingguan belum diatur tertulis", count: 1 },
      {
        reason: "bpjsBelumDidukung",
        label: "BPJS mingguan belum didukung (agregator se-masa belum tersedia)",
        count: 4,
      },
      {
        reason: "plafonPotongan",
        label: "Potongan melebihi plafon 50% upah (PP 36/2021 Pasal 65)",
        count: 6,
      },
      { reason: "berhenti", label: "Karyawan berhenti — di luar populasi massal", count: 3 },
    ])
    expect(
      payrollRunSkipLines({ frekuensiLain: 0, pinjaman: 0, bpjsBelumDidukung: 0, plafonPotongan: 0, irisan: 0, berhenti: 0, cakupan: 0 }),
    ).toEqual([])
  })
})

describe("BulkGeneratePayrollButton — pemilih run mingguan/bulanan F-076-S", () => {
  it("default Bulanan terpilih; pemilih bulan tampil, pemilih Senin tidak", () => {
    const container = renderButton()
    openDialog(container)

    expect(radioByText("Bulanan").getAttribute("aria-checked")).toBe("true")
    expect(radioByText("Mingguan").getAttribute("aria-checked")).toBe("false")
    expect(document.body.querySelector("#period-test")).not.toBeNull()
    expect(document.body.querySelector("#weeklyStartDate-test")).toBeNull()
    expect(dialogText()).toContain("Tanggal cut-off akan diatur otomatis")
  })

  it("pilih Mingguan: pemilih Senin tampil tanpa cut-off, period turunan dari selesai", () => {
    const container = renderButton()
    openDialog(container)
    click(radioByText("Mingguan"))

    expect(radioByText("Mingguan").getAttribute("aria-checked")).toBe("true")
    expect(document.body.querySelector("#period-test")).toBeNull()
    expect(dialogText()).not.toContain("cut-off akan diatur otomatis")

    const start = document.body.querySelector<HTMLInputElement>("#weeklyStartDate-test")!
    const end = document.body.querySelector<HTMLInputElement>("#weeklyEndDate-test")!
    setInputValue(start, "2026-10-26")
    expect(end.value).toBe("2026-11-01")
    expect(dialogText()).toContain("2026-11")
  })

  it("run Mingguan memanggil action argumen (period-dari-selesai, mulai, selesai, WEEKLY)", async () => {
    const container = renderButton()
    openDialog(container)
    click(radioByText("Mingguan"))

    const start = document.body.querySelector<HTMLInputElement>("#weeklyStartDate-test")!
    setInputValue(start, "2026-10-26")

    await act(async () => {
      submitButton().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })

    expect(generateBulkPayroll).toHaveBeenCalledWith("2026-11", "2026-10-26", "2026-11-01", "WEEKLY")
  })

  it("run Mingguan fail-closed: count 0 + terlewati per label kontrak tampil apa adanya", async () => {
    generateBulkPayroll.mockResolvedValue({
      success: true,
      count: 0,
      skippedTotal: 6,
      skippedByReason: { frekuensiLain: 1, pinjaman: 1, bpjsBelumDidukung: 3, plafonPotongan: 1, irisan: 0, berhenti: 0, cakupan: 0 },
    })
    const container = renderButton()
    openDialog(container)
    click(radioByText("Mingguan"))

    await act(async () => {
      submitButton().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })

    const status = document.body.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status?.textContent).toContain("0 draf slip dibuat, 6 karyawan terlewati")
    expect(status?.textContent).toContain("Potongan melebihi plafon 50% upah (PP 36/2021 Pasal 65)")
    expect(status?.textContent).toContain("BPJS mingguan belum didukung (agregator se-masa belum tersedia)")
    expect(status?.textContent).toContain("Pinjaman aktif — cicilan mingguan belum diatur tertulis")
    expect(status?.textContent).toContain("Frekuensi bayar berbeda")
    expect(status?.textContent).not.toContain("Rentang beririsan")
  })

  it("run Bulanan tetap memanggil action argumen existing + MONTHLY eksplisit", async () => {
    const container = renderButton()
    openDialog(container)

    const periodInput = document.body.querySelector<HTMLInputElement>("#period-test")!
    setInputValue(periodInput, "2026-05")

    await act(async () => {
      submitButton().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })

    expect(generateBulkPayroll).toHaveBeenCalledWith("2026-05", "2026-04-26", "2026-05-25", "MONTHLY")
    expect(showSuccess).toHaveBeenCalled()
    expect(dialogText()).toContain("3 draf slip dibuat, 0 karyawan terlewati")
  })

  it("error server {success:false} tampil apa adanya (tidak diam)", async () => {
    generateBulkPayroll.mockResolvedValue({
      success: false,
      error: 'Periode penggajian "2026-10-W2" tidak valid — wajib format "YYYY-MM" (bulan masa dari tanggal selesai).',
    })
    const container = renderButton()
    openDialog(container)
    click(radioByText("Mingguan"))

    await act(async () => {
      submitButton().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })

    expect(showError).toHaveBeenCalledWith(
      'Periode penggajian "2026-10-W2" tidak valid — wajib format "YYYY-MM" (bulan masa dari tanggal selesai).',
    )
    expect(document.body.querySelector('[role="status"]')).toBeNull()
  })
})
