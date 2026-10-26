// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act } from "react"
import { CreditOverridePanel, type CreditGateBlockedState } from "../credit-override-panel"
import { CreditOverrideQueue, type CreditOverrideRow } from "@/components/reports/credit-override-queue"
import { SalesOrderForm } from "../sales-order-form"
import { mountInto, unmount, withContainer, withContainerAsync } from "./form-a11y-test-utils"

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getStatus: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("@/lib/utils/toast", () => ({ showError: mocks.showError, showSuccess: mocks.showSuccess }))
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/sales.actions", () => ({
  createSalesOrder: mocks.createOrder,
  createSalesInvoice: vi.fn(),
  getOpenSalesOrders: vi.fn().mockResolvedValue([]),
  updateSalesInvoice: vi.fn(),
  updateSalesOrder: vi.fn(),
}))
vi.mock("@/actions/credit-override.actions", () => ({
  getMyCreditOverrideStatus: mocks.getStatus,
  approveCreditOverride: mocks.approve,
  rejectCreditOverride: mocks.reject,
}))

const BLOCKED: CreditGateBlockedState = {
  error: "Dokumen tertahan gerbang kredit: Lewat batas. Batas kredit Rp1.000.000, PaparanBersih Rp2.500.000. Minta persetujuan override batas kredit untuk melanjutkan.",
  creditOverrideId: null,
  creditLimit: 1_000_000,
  creditExposure: 2_500_000,
  creditStatus: "over",
  creditStatusLabel: "Lewat batas",
}

function row(overrides: Partial<CreditOverrideRow> = {}): CreditOverrideRow {
  return {
    id: 7,
    customerId: 3,
    customerName: "PT Uji",
    documentType: "sales_order",
    attemptedAmount: 900_000,
    creditLimit: 1_000_000,
    exposure: 2_500_000,
    // Payload nyata server (#1072): kode tersimpan "over", bukan label.
    exposureStatus: "over",
    utilization: null,
    quotationId: null,
    salesOrderId: null,
    requestedBy: 11,
    requestReason: "Pelanggan langganan, pembayaran lancar",
    status: "pending",
    storedStatus: "pending",
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    usedDocumentId: null,
    usedDocumentNo: null,
    expiresAt: null,
    createdAt: "2026-10-27T00:00:00.000Z",
    updatedAt: "2026-10-27T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("CreditOverridePanel (035-F)", () => {
  it("label + nominal persis payload server (AC-CL2-F1)", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <CreditOverridePanel blocked={BLOCKED} reason="" onReasonChange={vi.fn()} />
      ))
      expect(container.textContent).toContain(BLOCKED.error)
      expect(container.querySelectorAll("dd")[0]?.textContent).toBe("Lewat batas")
      expect(container.textContent).toContain("Rp1.000.000")
      expect(container.textContent).toContain("Rp2.500.000")
      // Tanpa id: alasan override tampil; tombol simpan form tidak disentuh panel.
      expect(container.querySelector("#creditOverrideReason")).not.toBeNull()
      expect(container.querySelector('label[for="creditOverrideReason"]')?.textContent).toBe("Alasan Permintaan Override")
      unmount(root, container)
    })
  })

  it("dengan id: status dari server tampil; approved memberi tahu simpan ulang", async () => {
    mocks.getStatus.mockResolvedValue({
      success: true,
      data: { ...row(), status: "approved" },
    })
    await withContainerAsync(async (container) => {
      const root = mountInto(container, (
        <CreditOverridePanel blocked={{ ...BLOCKED, creditOverrideId: 7 }} reason="" onReasonChange={vi.fn()} />
      ))
      expect(container.querySelector("#creditOverrideReason")).toBeNull()
      const button = container.querySelector<HTMLButtonElement>('button[aria-label="Periksa status permintaan override"]')!
      await act(async () => { button.click() })
      expect(mocks.getStatus).toHaveBeenCalledWith(7)
      expect(container.textContent).toContain("Disetujui")
      expect(container.textContent).toContain("Simpan ulang dokumen yang sama")
      unmount(root, container)
    })
  })

  it("error status server tampil jujur", async () => {
    mocks.getStatus.mockResolvedValue({ success: false, error: "Permintaan override tidak ditemukan" })
    await withContainerAsync(async (container) => {
      const root = mountInto(container, (
        <CreditOverridePanel blocked={{ ...BLOCKED, creditOverrideId: 99 }} reason="" onReasonChange={vi.fn()} />
      ))
      const button = container.querySelector<HTMLButtonElement>('button[aria-label="Periksa status permintaan override"]')!
      await act(async () => { button.click() })
      expect(container.textContent).toContain("Permintaan override tidak ditemukan")
      unmount(root, container)
    })
  })
})

describe("CreditOverrideQueue (035-F)", () => {
  it("jejak terbaca tanpa izin setujui: nol tombol aksi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <CreditOverrideQueue rows={[row()]} canApprove={false} currentUserId={99} />
      ))
      expect(container.textContent).toContain("PT Uji")
      // Kode server "over" tampil sebagai label builder, bukan kode mentah.
      expect(container.textContent).toContain("Lewat batas")
      expect(container.textContent).not.toContain("over")
      expect(container.textContent).toContain("Menunggu Persetujuan")
      expect(container.querySelector('button[aria-label="Setujui override batas kredit 7"]')).toBeNull()
      unmount(root, container)
    })
  })

  it("kosong: empty state jelas", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <CreditOverrideQueue rows={[]} canApprove currentUserId={99} />
      ))
      expect(container.textContent).toContain("Belum ada permintaan override batas kredit.")
      unmount(root, container)
    })
  })

  it("tolak tanpa alasan: error wajib, action tidak dipanggil", async () => {
    await withContainerAsync(async (container) => {
      const root = mountInto(container, (
        <CreditOverrideQueue rows={[row()]} canApprove currentUserId={99} />
      ))
      const button = container.querySelector<HTMLButtonElement>('button[aria-label="Tolak override batas kredit 7"]')!
      await act(async () => { button.click() })
      expect(mocks.reject).not.toHaveBeenCalled()
      expect(container.textContent).toContain("Alasan penolakan wajib diisi")
      unmount(root, container)
    })
  })

  it("SoD: penolakan server untuk permintaan sendiri tampil verbatim, bukan sukses semu", async () => {
    mocks.approve.mockResolvedValue({
      success: false,
      error: "Penyetuju tidak boleh sama dengan peminta override (pemisahan tugas)",
    })
    await withContainerAsync(async (container) => {
      const root = mountInto(container, (
        <CreditOverrideQueue rows={[row()]} canApprove currentUserId={11} />
      ))
      expect(container.textContent).toContain("Permintaan Anda sendiri")
      const button = container.querySelector<HTMLButtonElement>('button[aria-label="Setujui override batas kredit 7"]')!
      await act(async () => { button.click() })
      expect(mocks.approve).toHaveBeenCalledWith(7)
      expect(mocks.showError).toHaveBeenCalledWith("Penyetuju tidak boleh sama dengan peminta override (pemisahan tugas)")
      expect(container.textContent).toContain("Penyetuju tidak boleh sama dengan peminta override (pemisahan tugas)")
      unmount(root, container)
    })
  })
})

describe("SalesOrderForm gerbang kredit (035-F, AC-CL2-F2)", () => {
  it("submit tertahan: panel payload server tampil, tombol simpan TIDAK disabled oleh status kredit", async () => {
    mocks.createOrder.mockResolvedValue({ success: false, ...BLOCKED })
    await withContainerAsync(async (container) => {
      const root = mountInto(container, (
        <SalesOrderForm customers={[{ id: 3, name: "PT Uji", code: "C003" } as never]} defaultCustomerId={3} />
      ))
      const form = container.querySelector("form")!
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
      expect(container.textContent).toContain("Lewat batas")
      expect(container.textContent).toContain("Rp2.500.000")
      expect(submit.disabled).toBe(false)
      // Alasan kosong: simpan ulang dicegah UI dengan error wajib (server tetap penahan akhir).
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })
      expect(container.textContent).toContain("Alasan permintaan override wajib diisi")
      expect(mocks.createOrder).toHaveBeenCalledTimes(1)
      unmount(root, container)
    })
  })
})
