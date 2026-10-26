// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getDeliveredUnbilledQueue: vi.fn(),
  customerFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/reports/delivered-unbilled-data", () => ({
  getDeliveredUnbilledQueue: mocks.getDeliveredUnbilledQueue,
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { customer: { findMany: mocks.customerFindMany } },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/laporan/terkirim-belum-terfaktur",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock(
  "@/components/reports/report-page-shell",
  async () =>
    (await import("@/components/reports/__tests__/card-test-utils"))
      .reportPageShellModule,
)

vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

import DeliveredUnbilledPage from "../page"
import {
  buildDeliveredUnbilledQueue,
  DELIVERED_UNBILLED_EMPTY_TEXT,
} from "@/lib/reports/delivered-unbilled"
import { deliveredUnbilledInput } from "@/lib/reports/__tests__/delivered-unbilled-fixtures"
import { FULFILLABLE_ORDER_STATUSES } from "@/lib/reports/order-fulfillment-data"
import {
  renderPageNode,
  unmountCard,
  clearRenderedCards,
} from "@/components/reports/__tests__/card-test-utils"

const NOW = new Date(Date.UTC(2026, 9, 26, 3, 0))

function queueWithRow() {
  return buildDeliveredUnbilledQueue(
    [
      deliveredUnbilledInput({
        salesOrderId: 9,
        slug: "so-0009",
        documentNo: "SO-0009",
        customerName: "PT Uji",
        lines: [{ lineId: 91, deliveredQty: 2, unitPrice: 50_000 }],
        deliveries: [
          {
            status: "delivered",
            date: new Date(Date.UTC(2026, 9, 25)),
            confirmedAt: new Date(Date.UTC(2026, 9, 25)),
            deliveredAt: new Date(Date.UTC(2026, 9, 25)),
            deliveredQty: 2,
          },
        ],
      }),
    ],
    NOW,
    FULFILLABLE_ORDER_STATUSES,
  )
}

let roots: Root[] = []
beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ name: "Admin", email: "a@b.c" })
  mocks.customerFindMany.mockResolvedValue([
    { id: 7, code: "C-07", name: "PT Uji", slug: "pt-uji" },
  ])
})
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("DeliveredUnbilledPage F-2026-10-26-058-S", () => {
  it("fail-closed view_reports sebelum loader; queue verbatim tampil", async () => {
    mocks.getDeliveredUnbilledQueue.mockResolvedValue(queueWithRow())
    const node = await DeliveredUnbilledPage({
      params: Promise.resolve({ segments: ["2026"] }),
      searchParams: Promise.resolve({}),
    })
    const { container, root } = renderPageNode(node)
    roots.push(root)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.getDeliveredUnbilledQueue).toHaveBeenCalledTimes(1)
    const args = mocks.getDeliveredUnbilledQueue.mock.calls[0]?.[0] as {
      start?: Date
      end?: Date
      customerId?: number
    }
    expect(args.start).toBeInstanceOf(Date)
    expect(args.end).toBeInstanceOf(Date)
    expect(args.customerId).toBeUndefined()
    expect(container.textContent ?? "").toContain("SO-0009")
  })

  it("segmen pelanggan/<slug> diteruskan sebagai customerId ke loader", async () => {
    mocks.getDeliveredUnbilledQueue.mockResolvedValue(
      buildDeliveredUnbilledQueue([], NOW, FULFILLABLE_ORDER_STATUSES),
    )
    const node = await DeliveredUnbilledPage({
      params: Promise.resolve({ segments: ["2026", "pelanggan", "pt-uji"] }),
      searchParams: Promise.resolve({}),
    })
    const { container, root } = renderPageNode(node)
    roots.push(root)
    const args = mocks.getDeliveredUnbilledQueue.mock.calls[0]?.[0] as {
      customerId?: number
    }
    expect(args.customerId).toBe(7)
    expect(container.textContent ?? "").toContain(DELIVERED_UNBILLED_EMPTY_TEXT)
  })
})
