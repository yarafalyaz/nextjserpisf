// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mount, act } from "./mount"

const refreshMock = vi.fn()
const { showSuccessMock, showErrorMock } = vi.hoisted(() => ({
  showSuccessMock: vi.fn(),
  showErrorMock: vi.fn(),
}))
const createMock = vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true }))
const approveMock = vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true }))
const accrualMock = vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true }))
const attachMock = vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true }))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: refreshMock }
  },
}))
vi.mock("@/actions/hrm.actions", () => ({
  createPkwtEvent: (...a: unknown[]) => createMock(...(a as [])),
  approvePkwtEvent: (...a: unknown[]) => approveMock(...(a as [])),
  runPkwtAccrual: (...a: unknown[]) => accrualMock(...(a as [])),
  attachPkwtEventToPayroll: (...a: unknown[]) => attachMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: showSuccessMock, showError: showErrorMock }))
vi.mock("@/components/ui/button", async () => await import("./button-mock"))

import {
  PkwtCompensationPanel,
  type PkwtReportView,
} from "../pkwt-compensation-panel"

const report = (over: Partial<PkwtReportView> = {}): PkwtReportView => ({
  rows: [
    {
      eventId: 11,
      employeeId: 5,
      employeeName: "Budi PKWT",
      segmentStart: new Date(Date.UTC(2026, 0, 1)),
      segmentEnd: new Date(Date.UTC(2026, 5, 30)),
      // Nilai builder apa adanya; UI dilarang hitung ulang dari tanggal.
      serviceMonths: 99,
      amount: 1234567,
      status: "draft",
      isLegacy: false,
      accruedToDate: 500000,
      paidAmount: 0,
      outstandingAmount: 765432,
    },
    {
      eventId: 12,
      employeeId: 6,
      employeeName: "Sari PKWT",
      segmentStart: new Date(Date.UTC(2025, 0, 1)),
      segmentEnd: new Date(Date.UTC(2025, 11, 31)),
      serviceMonths: 12,
      amount: 2400000,
      status: "approved",
      isLegacy: true,
      accruedToDate: 2400000,
      paidAmount: 0,
      outstandingAmount: 2400000,
    },
  ],
  glPayableBalance: 3000000,
  expectedPayableTotal: 2400000,
  accrualSubledgerTotal: 2900000,
  paidSlipTotal: 0,
  unpaidList: [
    {
      employeeId: 6,
      name: "Sari PKWT",
      segmentEnd: new Date(Date.UTC(2025, 11, 31)),
      frozenAmount: 2400000,
      paidAmount: 0,
      outstandingAmount: 2400000,
      label: "Label verbatim builder PKWT-UNPAID",
    },
  ],
  pendingApprovalSlips: [
    {
      employeeId: 6,
      name: "Sari PKWT",
      segmentEnd: new Date(Date.UTC(2025, 11, 31)),
      frozenAmount: 2400000,
      paidAmount: 0,
      outstandingAmount: 2400000,
      label: "Label verbatim builder PKWT-PENDING",
    },
  ],
  anomalies: [
    {
      code: "GL_VS_EVENT_DIFF",
      label: "GL vs peristiwa",
      detail: "Saldo GL 210207 Rp3.000.000 vs utang seharusnya Rp2.400.000 — selisih Rp600.000; tampil sebagai temuan, bukan dipilih diam-diam.",
    },
  ],
  ...over,
})

const employees = [{ id: 5, name: "Budi PKWT", employeeNumber: "PKWT-001" }]
const draftSlips = [
  { id: 77, documentNo: "PAY-2026-077", employeeId: 6, employeeName: "Sari PKWT", period: "2026-10" },
]

function renderPanel(r = report()) {
  return mount(
    <PkwtCompensationPanel
      report={r}
      employees={employees}
      draftSlips={draftSlips}
      canCreate
      canApprove
      canRunAccrual
      canAttach
    />,
  )
}

describe("PkwtCompensationPanel F-2026-10-24-132-V", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createMock.mockResolvedValue({ success: true })
    approveMock.mockResolvedValue({ success: true })
    accrualMock.mockResolvedValue({ success: true })
    attachMock.mockResolvedValue({ success: true })
  })

  it("render passthrough builder: label verbatim, status chip, nominal apa adanya, nol hitung UI", () => {
    const { container, root } = renderPanel()
    const text = container.textContent ?? ""
    // Label per baris verbatim fixture builder (bukan heading seksi UI):
    // mengganti render label baris dengan karangan UI harus MERAH.
    expect(text).toContain("Label verbatim builder PKWT-UNPAID")
    expect(text).toContain("Label verbatim builder PKWT-PENDING")
    expect(text).toContain("Kompensasi PKWT belum dibayar")
    expect(text).toContain("GL vs peristiwa")
    expect(text).toContain("selisih Rp600.000; tampil sebagai temuan, bukan dipilih diam-diam.")
    // serviceMonths builder = 99 tampil apa adanya (hitung ulang dari tanggal akan beda).
    expect(text).toContain("99")
    expect(text).toContain("Rp 1.234.567")
    expect(text).toContain("Rp 765.432")
    expect(text).toContain("Konsep")
    expect(text).toContain("Disetujui")
    expect(text).toContain("Legacy")
    expect(container.querySelector('[aria-label="Daftar peristiwa kompensasi PKWT"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Daftar kompensasi PKWT belum dibayar"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Daftar slip disetujui mengandung kompensasi PKWT"]')).not.toBeNull()
    root.unmount()
  })

  it("kosong: teks kosong jelas tiap seksi", () => {
    const { container, root } = renderPanel(
      report({ rows: [], unpaidList: [], pendingApprovalSlips: [], anomalies: [] }),
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Belum ada peristiwa kompensasi PKWT.")
    expect(text).toContain("Tidak ada kompensasi PKWT belum dibayar.")
    expect(text).toContain("Tidak ada slip disetujui yang mengandung baris kompensasi PKWT.")
    root.unmount()
  })

  it("tanpa izin: form dan tombol aksi tidak tampil", () => {
    const { container, root } = mount(
      <PkwtCompensationPanel
        report={report()}
        employees={employees}
        draftSlips={draftSlips}
        canCreate={false}
        canApprove={false}
        canRunAccrual={false}
        canAttach={false}
      />,
    )
    expect(container.querySelector('[aria-label="Formulir peristiwa kompensasi PKWT"]')).toBeNull()
    expect(container.querySelector('[aria-label="Formulir akrual kompensasi PKWT"]')).toBeNull()
    expect(container.querySelector('[aria-label="Formulir tarik kompensasi PKWT ke slip"]')).toBeNull()
    expect(container.textContent ?? "").not.toContain("Setujui")
    root.unmount()
  })

  it("label cakupan GL: saldo perusahaan jujur saat glIsCompanyWide, label polos saat bisa dibandingkan", () => {
    const scoped = renderPanel(
      report({ glIsCompanyWide: true, glComparableToScope: false, anomalies: [] }),
    )
    const scopedText = scoped.container.textContent ?? ""
    expect(scopedText).toContain("Saldo GL Utang Kompensasi (210207) — saldo perusahaan")
    expect(scopedText).toContain(
      "Saldo GL mencakup seluruh perusahaan; baris dan total lain di panel ini hanya karyawan dalam cakupan Anda, jadi saldo GL tidak diperbandingkan dengan total panel.",
    )
    scoped.root.unmount()

    const comparable = renderPanel(
      report({ glIsCompanyWide: false, glComparableToScope: true }),
    )
    const comparableText = comparable.container.textContent ?? ""
    expect(comparableText).toContain("Saldo GL Utang Kompensasi (210207)")
    expect(comparableText).not.toContain("saldo perusahaan")
    expect(comparableText).not.toContain("tidak diperbandingkan dengan total panel")
    comparable.root.unmount()
  })

  it("submit peristiwa: FormData diteruskan, sukses toast + refresh", async () => {
    const { container, root } = renderPanel()
    const form = container.querySelector<HTMLFormElement>(
      '[aria-label="Formulir peristiwa kompensasi PKWT"]',
    )!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(createMock).toHaveBeenCalledTimes(1)
    const fd = (createMock.mock.calls as unknown as [FormData][])[0]?.[0]
    expect(fd).toBeInstanceOf(FormData)
    expect(showSuccessMock).toHaveBeenCalledWith("Peristiwa kompensasi PKWT dibuat")
    expect(refreshMock).toHaveBeenCalled()
    root.unmount()
  })

  it("error server tampil verbatim: gagal buat peristiwa", async () => {
    createMock.mockResolvedValue({
      success: false,
      error: "Masa kerja 0.5 bulan kurang dari 1 bulan — kompensasi PKWT tidak berhak (PP 35/2021 Pasal 15(3)); peristiwa ditolak.",
    })
    const { container, root } = renderPanel()
    const form = container.querySelector<HTMLFormElement>(
      '[aria-label="Formulir peristiwa kompensasi PKWT"]',
    )!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(showErrorMock).toHaveBeenCalledWith(
      "Masa kerja 0.5 bulan kurang dari 1 bulan — kompensasi PKWT tidak berhak (PP 35/2021 Pasal 15(3)); peristiwa ditolak.",
    )
    root.unmount()
  })

  it("setujui hanya baris draft; akrual kirim periode; tarik kirim payrollId + eventId", async () => {
    const { container, root } = renderPanel()
    const approveBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Setujui",
    )!
    await act(async () => {
      approveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(approveMock).toHaveBeenCalledWith(11)

    const accrualForm = container.querySelector<HTMLFormElement>(
      '[aria-label="Formulir akrual kompensasi PKWT"]',
    )!
    const periodInput = accrualForm.querySelector<HTMLInputElement>('[name="period"]')!
    periodInput.value = "2026-10"
    await act(async () => {
      accrualForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(accrualMock).toHaveBeenCalledWith("2026-10")

    const attachForm = container.querySelector<HTMLFormElement>(
      '[aria-label="Formulir tarik kompensasi PKWT ke slip"]',
    )!
    ;(attachForm.querySelector('[name="eventId"]') as HTMLSelectElement).value = "12"
    ;(attachForm.querySelector('[name="payrollId"]') as HTMLSelectElement).value = "77"
    await act(async () => {
      attachForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(attachMock).toHaveBeenCalledTimes(1)
    const [payrollId, fd] = attachMock.mock.calls[0] as unknown as [number, FormData]
    expect(payrollId).toBe(77)
    expect(fd.get("eventId")).toBe("12")
    root.unmount()
  })

  it("aksi melempar (network/server) → toast error fallback, bukan unhandled rejection", async () => {
    approveMock.mockRejectedValueOnce(new Error("network down"))
    const { container, root } = renderPanel()
    const approveBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Setujui",
    )!
    await act(async () => {
      approveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(showErrorMock).toHaveBeenCalledWith("Gagal menjalankan aksi kompensasi PKWT")
    expect(showSuccessMock).not.toHaveBeenCalled()
    root.unmount()
  })

  it("error tarik verbatim: parsial/dobel ditolak server tampil apa adanya", async () => {
    attachMock.mockResolvedValue({
      success: false,
      error: "Peristiwa kompensasi PKWT ini sudah punya baris slip — satu peristiwa paling banyak satu baris slip terbayar.",
    })
    const { container, root } = renderPanel()
    const attachForm = container.querySelector<HTMLFormElement>(
      '[aria-label="Formulir tarik kompensasi PKWT ke slip"]',
    )!
    ;(attachForm.querySelector('[name="eventId"]') as HTMLSelectElement).value = "12"
    ;(attachForm.querySelector('[name="payrollId"]') as HTMLSelectElement).value = "77"
    await act(async () => {
      attachForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(showErrorMock).toHaveBeenCalledWith(
      "Peristiwa kompensasi PKWT ini sudah punya baris slip — satu peristiwa paling banyak satu baris slip terbayar.",
    )
    root.unmount()
  })
})
