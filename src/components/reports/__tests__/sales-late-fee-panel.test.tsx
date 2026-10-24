// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const actions = vi.hoisted(() => ({
  createCustomerLateFeeTerm: vi.fn(
    async (_formData: FormData): Promise<{ success: boolean; error?: string; id?: number; documentNo?: string }> => ({ success: true, id: 7 }),
  ),
  issueSalesLateFee: vi.fn(
    async (_formData: FormData): Promise<{ success: boolean; error?: string; id?: number; documentNo?: string }> => ({ success: true, id: 1, documentNo: "LF-0001" }),
  ),
  paySalesLateFee: vi.fn(
    async (_formData: FormData): Promise<{ success: boolean; error?: string; id?: number; documentNo?: string }> => ({ success: true, id: 11 }),
  ),
  reverseSalesLateFee: vi.fn(
    async (_formData: FormData): Promise<{ success: boolean; error?: string; id?: number; documentNo?: string }> => ({ success: true, id: 12, documentNo: "LF-0002" }),
  ),
}))
const toast = vi.hoisted(() => ({ showError: vi.fn(), showSuccess: vi.fn() }))

vi.mock("@/actions/sales-late-fee.actions", () => actions)
vi.mock("@/lib/utils/toast", () => toast)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { SalesLateFeePanel } from "../sales-late-fee-panel"
import {
  buildSalesLateFeePanel,
  SALES_LATE_FEE_ACCOUNT_UNSET_TEXT,
  SALES_LATE_FEE_NOTICE_TEXT,
  type SalesLateFeeDocumentInput,
} from "@/lib/reports/sales-late-fee"

const doc: SalesLateFeeDocumentInput = {
  id: 1,
  documentNo: "LF-0001",
  date: new Date(2026, 9, 15),
  dueReferenceDate: new Date(2026, 9, 1),
  overdueDays: 14,
  basisAmount: 6_000_000,
  ratePercentPerDay: 0.1,
  flatAmountPerDay: null,
  capAmount: null,
  amount: 84_000,
  paidAmount: 34_000,
  status: "partial",
  reversesId: null,
  notes: null,
  payments: [
    {
      id: 11,
      documentNo: "LF-PAY-0001",
      amount: 34_000,
      paymentDate: new Date(2026, 9, 16),
      paymentMethod: "transfer",
      referenceNo: "REF-1",
    },
  ],
}

function makePanel(accountSet: boolean) {
  return buildSalesLateFeePanel({
    salesInvoiceId: 9,
    invoiceDocumentNo: "INV-0009",
    customerId: 3,
    customerName: "PT Uji",
    documents: [doc],
    terms: [
      {
        id: 7,
        ratePercentPerDay: 0.1,
        flatAmountPerDay: null,
        capAmount: null,
        effectiveFrom: new Date(2026, 0, 1),
        effectiveTo: null,
        notes: null,
      },
    ],
    lateFeeIncomeAccountSet: accountSet,
  })
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => act(() => root.unmount()))
  roots = []
  document.body.replaceChildren()
  vi.clearAllMocks()
})
beforeEach(() => {
  actions.issueSalesLateFee.mockResolvedValue({
    success: true,
    id: 1,
    documentNo: "LF-0001",
  })
})

function renderPanel(canCreate = true, canReverse = true, accountSet = true) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      <SalesLateFeePanel
        panel={makePanel(accountSet)}
        accounts={[{ id: 5, code: "1101", name: "Kas" }]}
        paymentMethods={[{ code: "transfer", name: "Transfer Bank" }]}
        canCreate={canCreate}
        canReverse={canReverse}
      />,
    )
  })
  roots.push(root)
  return container
}

function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(label),
  )
  expect(button, `tombol ${label}`).toBeTruthy()
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

describe("SalesLateFeePanel F-2026-10-22-093-V", () => {
  it("snapshot dokumen + saldo terpisah tampil verbatim; tanpa edit nominal", () => {
    const container = renderPanel()
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Dokumen Denda Piutang"]')).toBeTruthy()
    expect(text).toContain(SALES_LATE_FEE_NOTICE_TEXT)
    expect(text).toContain("LF-0001")
    expect(text).toContain("Terlambat")
    expect(text).toContain("14 hari")
    expect(text).toContain("Basis Piutang")
    expect(text).toContain("0.1% per hari")
    expect(text).toContain("Sisa Saldo Denda")
    expect(text).toContain("Sebagian Dibayar")
    expect(text).toContain("LF-PAY-0001")
    expect(text).not.toContain("Ubah Nominal")
    expect(text).not.toContain("Edit Nominal")
  })

  it("akun pendapatan belum diset → peringatan verbatim tampil", () => {
    const container = renderPanel(true, true, false)
    expect(container.textContent).toContain(SALES_LATE_FEE_ACCOUNT_UNSET_TEXT)
  })

  it("tanpa izin create/delete → tombol aksi sensitif tidak tampil", () => {
    const container = renderPanel(false, false)
    const text = container.textContent ?? ""
    expect(text).not.toContain("Terbitkan Dokumen Denda")
    expect(text).not.toContain("Catat Pembayaran Denda")
    expect(text).not.toContain("Balik Dokumen Denda")
    expect(text).toContain("LF-0001")
  })

  it("terbit: idempotencyKey terkirim; error server tampil verbatim", async () => {
    actions.issueSalesLateFee.mockResolvedValue({
      success: false,
      error: "Akun pendapatan denda belum diset.",
    })
    const container = renderPanel()
    clickButton(container, "Terbitkan Dokumen Denda")
    const form = document.body.querySelector("form")
    expect(form).toBeTruthy()
    await act(async () => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      )
    })
    expect(actions.issueSalesLateFee).toHaveBeenCalledTimes(1)
    const formData = actions.issueSalesLateFee.mock.calls[0][0] as FormData
    expect(String(formData.get("salesInvoiceId"))).toBe("9")
    expect(String(formData.get("termId"))).toBe("7")
    expect(String(formData.get("idempotencyKey")).length).toBeGreaterThan(0)
    expect(toast.showError).toHaveBeenCalledWith(
      "Akun pendapatan denda belum diset.",
    )
  })
})
