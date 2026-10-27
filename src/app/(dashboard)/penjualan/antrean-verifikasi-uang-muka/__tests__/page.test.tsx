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

vi.mock("@/lib/reports/down-payment-verification-queue-data", () => ({
  getDownPaymentVerificationQueue: mocks.getQueue,
}))

import DownPaymentVerificationQueuePage from "../page"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
})

describe("DownPaymentVerificationQueuePage F-2026-10-26-051-S", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.getQueue.mockResolvedValue({
      rows: [],
      summary: {
        total: 0,
        totalAmountSen: 0,
        membukaInvoice: 0,
        menunggu: 0,
        tanpaBukti: 0,
        takTerklasifikasi: 0,
      },
    })
  })

  it("tanpa izin view_down_payments: halaman menolak sebelum loader dipanggil (MERAH fail-closed)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(DownPaymentVerificationQueuePage()).rejects.toThrow(
      "Tidak memiliki izin",
    )
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_down_payments")
    expect(mocks.getQueue).not.toHaveBeenCalled()
  })

  it("berizin: loader dipanggil, judul + breadcrumb antrean tampil", async () => {
    const node = await DownPaymentVerificationQueuePage()
    const { container, root } = renderPageNode(node)
    roots.push(root)
    expect(mocks.getQueue).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("Antrean Verifikasi Uang Muka")
    expect(container.textContent).toContain(
      "Belum ada uang muka yang menunggu verifikasi",
    )
  })
})
