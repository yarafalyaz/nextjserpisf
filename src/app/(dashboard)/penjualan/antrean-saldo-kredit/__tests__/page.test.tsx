// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import type { Root } from "react-dom/client"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getQueue: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/reports/customer-credit-queue-data", () => ({
  getCustomerCreditQueue: mocks.getQueue,
}))

import CustomerCreditQueuePage from "../page"
import { CUSTOMER_CREDIT_QUEUE_TITLE } from "@/lib/reports/customer-credit-queue"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
})

describe("CustomerCreditQueuePage 083-F", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.getQueue.mockResolvedValue({
      rows: [],
      summary: { jumlahBaris: 0, totalSaldo: 0, jumlahPenandaFpUangMuka: 0 },
      anomaly: { openSaldoNol: 0, selesaiSaldoPositif: 0, alokasiMelebihiDiterima: 0 },
    })
  })

  it("tanpa izin view_sales_invoices: halaman menolak sebelum loader dipanggil (fail-closed)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(CustomerCreditQueuePage()).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_sales_invoices")
    expect(mocks.getQueue).not.toHaveBeenCalled()
  })

  it("berizin: loader dipanggil, judul verbatim + teks kosong antrean tampil", async () => {
    const node = await CustomerCreditQueuePage()
    const { container, root } = renderPageNode(node)
    roots.push(root)
    expect(mocks.getQueue).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain(CUSTOMER_CREDIT_QUEUE_TITLE)
    expect(container.textContent).toContain("Tidak ada saldo kredit pelanggan terbuka.")
  })
})
