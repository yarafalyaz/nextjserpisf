// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showProcessResult: vi.fn(),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    isDisabled,
    ...rest
  }: {
    children: React.ReactNode
    isDisabled?: boolean
    [key: string]: unknown
  }) => (
    <button {...(rest as Record<string, unknown>)} disabled={isDisabled}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}))

import { ProcessButton } from "../process-button"
import { VoidButton } from "../void-button"

const processAction = vi.fn(async () => ({ success: true }))
const voidAction = vi.fn(async () => ({ success: true }))

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function buttonByText(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) ?? null
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("ProcessButton gerbang izin UI (canProcess)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("canProcess=false: tombol proses absen", () => {
    const { container, root } = mount(
      <ProcessButton id={7} action={processAction} label="Posting" canProcess={false} />,
    )
    expect(buttonByText(container, "Posting")).toBeNull()
    expect(container.querySelector("button")).toBeNull()
    act(() => root.unmount())
  })

  it("canProcess=true: tombol proses tampil", () => {
    const { container, root } = mount(
      <ProcessButton id={7} action={processAction} label="Posting" canProcess />,
    )
    expect(buttonByText(container, "Posting")).not.toBeNull()
    act(() => root.unmount())
  })

  it("tanpa prop: tombol proses tampil (pemanggil lama tidak berubah)", () => {
    const { container, root } = mount(<ProcessButton id={7} action={processAction} label="Posting" />)
    expect(buttonByText(container, "Posting")).not.toBeNull()
    act(() => root.unmount())
  })
})

describe("VoidButton gerbang izin UI (canVoid)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("canVoid=false: tombol Batalkan absen", () => {
    const { container, root } = mount(<VoidButton id={7} action={voidAction} canVoid={false} />)
    expect(buttonByText(container, "Batalkan")).toBeNull()
    expect(container.querySelector("button")).toBeNull()
    act(() => root.unmount())
  })

  it("canVoid=true: tombol Batalkan tampil", () => {
    const { container, root } = mount(<VoidButton id={7} action={voidAction} canVoid />)
    expect(buttonByText(container, "Batalkan")).not.toBeNull()
    act(() => root.unmount())
  })

  it("tanpa prop: tombol Batalkan tampil (pemanggil lama tidak berubah)", () => {
    const { container, root } = mount(<VoidButton id={7} action={voidAction} />)
    expect(buttonByText(container, "Batalkan")).not.toBeNull()
    act(() => root.unmount())
  })
})

describe("halaman meneruskan izin proses persis per permukaan", () => {
  it("faktur: ProcessButton canProcess post_sales_invoices, VoidButton canVoid delete_sales_invoices, chip tetap di luar gerbang", () => {
    const page = source("src/app/(dashboard)/penjualan/faktur/[slug]/page.tsx")
    expect(page).toContain('hasPermission("post_sales_invoices")')
    expect(page).toMatch(/<ProcessButton[\s\S]{0,300}?action=\{postInvoice\}/)
    expect(page).toMatch(/action=\{postInvoice\}[\s\S]{0,300}?canProcess=\{canPost\}/)
    expect(page).toContain('hasPermission("delete_sales_invoices")')
    expect(page).toMatch(/<VoidButton[\s\S]{0,300}?action=\{voidSalesInvoice\}/)
    expect(page).toMatch(/action=\{voidSalesInvoice\}[\s\S]{0,300}?canVoid=\{canVoid\}/)
    expect(page).toContain("badge={<StatusChip status={invoice.status} />}")
  })

  it("surat-jalan: kedua ProcessButton canProcess edit_delivery_orders, span status tetap tampil", () => {
    const page = source("src/app/(dashboard)/penjualan/surat-jalan/[slug]/page.tsx")
    expect(page).toContain('hasPermission("edit_delivery_orders")')
    expect(page).toContain('canEditDeliveryOrders = await hasPermission("edit_delivery_orders")')
    expect(page).toMatch(/action=\{shipDeliveryOrder\}[\s\S]{0,400}?canProcess=\{canEditDeliveryOrders\}/)
    expect(page).toMatch(/action=\{deliverDeliveryOrder\}[\s\S]{0,400}?canProcess=\{canEditDeliveryOrders\}/)
    expect(page).toContain("{statusLabel(deliveryOrder.status)}")
  })

  it("penerimaan: ProcessButton canProcess verify_goods_receipts, chip tetap tampil", () => {
    const page = source("src/app/(dashboard)/pembelian/penerimaan/[slug]/page.tsx")
    expect(page).toContain('hasPermission("verify_goods_receipts")')
    expect(page).toMatch(/action=\{verifyGoodsReceipt\}[\s\S]{0,400}?canProcess=\{canVerifyGoodsReceipt\}/)
    expect(page).toContain("badge={<StatusChip status={receipt.status} />}")
  })

  it("retur pembelian: ProcessButton canProcess approve_purchase_returns, chip tetap tampil", () => {
    const page = source("src/app/(dashboard)/pembelian/retur/[slug]/page.tsx")
    expect(page).toContain('hasPermission("approve_purchase_returns")')
    expect(page).toMatch(/action=\{processPurchaseReturn\}[\s\S]{0,300}?canProcess=\{canApprovePurchaseReturn\}/)
    expect(page).toContain("badge={<StatusChip status={purchaseReturn.status} />}")
  })

  it("tagihan: ProcessButton canProcess approve_vendor_bills, label status tetap tampil", () => {
    const page = source("src/app/(dashboard)/pembelian/tagihan/[slug]/page.tsx")
    expect(page).toContain('hasPermission("approve_vendor_bills")')
    expect(page).toMatch(/action=\{confirmVendorBill\}[\s\S]{0,300}?canProcess=\{canApproveVendorBill\}/)
    expect(page).toContain("{statusLabel(bill.status)}")
  })

  it("pengeluaran-material: ProcessButton canProcess edit_material_issues, chip tetap tampil", () => {
    const page = source("src/app/(dashboard)/inventaris/pengeluaran-material/[slug]/page.tsx")
    expect(page).toContain('hasPermission("edit_material_issues")')
    expect(page).toMatch(/action=\{completeMaterialIssue\}[\s\S]{0,300}?canProcess=\{canEditMaterialIssue\}/)
    expect(page).toContain("<StatusChip status={issue.status} />")
  })

  it("penyesuaian: ProcessButton canProcess process_stock_adjustments, chip tetap tampil", () => {
    const page = source("src/app/(dashboard)/inventaris/penyesuaian/[slug]/page.tsx")
    expect(page).toContain('hasPermission("process_stock_adjustments")')
    expect(page).toMatch(/action=\{processStockAdjustment\}[\s\S]{0,300}?canProcess=\{canProcessStockAdjustment\}/)
    expect(page).toContain("badge={")
    expect(page).toContain("status={adjustment.status}")
  })

  it("tagihan: VoidButton canVoid delete_vendor_bills, label status tetap tampil", () => {
    const page = source("src/app/(dashboard)/pembelian/tagihan/[slug]/page.tsx")
    expect(page).toContain('hasPermission("delete_vendor_bills")')
    expect(page).toMatch(/<VoidButton[\s\S]{0,300}?action=\{voidVendorBill\}/)
    expect(page).toMatch(/action=\{voidVendorBill\}[\s\S]{0,300}?canVoid=\{canVoidVendorBill\}/)
    expect(page).toContain("{statusLabel(bill.status)}")
  })

  it("pesanan pembelian: VoidButton canVoid edit_purchase_orders, chip tetap tampil", () => {
    const page = source("src/app/(dashboard)/pembelian/pesanan/[slug]/page.tsx")
    expect(page).toContain('hasPermission("edit_purchase_orders")')
    expect(page).toMatch(/<VoidButton[\s\S]{0,300}?action=\{cancelPurchaseOrder\}/)
    expect(page).toMatch(/action=\{cancelPurchaseOrder\}[\s\S]{0,300}?canVoid=\{canCancelPurchaseOrder\}/)
    expect(page).toContain("badge={<StatusChip status={po.status} />}")
  })

  it("transfer: ProcessButton canProcess edit_inventory_transfers, chip tetap tampil", () => {
    const page = source("src/app/(dashboard)/inventaris/transfer/[slug]/page.tsx")
    expect(page).toContain('hasPermission("edit_inventory_transfers")')
    expect(page).toMatch(/action=\{processInventoryTransfer\}[\s\S]{0,300}?canProcess=\{canProcessInventoryTransfer\}/)
    expect(page).toContain("badge={<StatusChip status={transfer.status}")
  })
})
