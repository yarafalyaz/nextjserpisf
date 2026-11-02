// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  userWarehouseFindMany: vi.fn(),
  stockMoveFindMany: vi.fn(),
  goodsReceiptCount: vi.fn(),
  warehouseCount: vi.fn(),
  itemCount: vi.fn(),
  layerGroupBy: vi.fn(),
  layerFindMany: vi.fn(),
  settingFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userWarehouse: { findMany: mocks.userWarehouseFindMany },
    stockMove: { findMany: mocks.stockMoveFindMany },
    goodsReceipt: { count: mocks.goodsReceiptCount },
    warehouse: { count: mocks.warehouseCount },
    item: { count: mocks.itemCount, findMany: mocks.itemFindMany },
    inventoryLayer: { groupBy: mocks.layerGroupBy, findMany: mocks.layerFindMany },
    itemWarehouseSetting: { findMany: mocks.settingFindMany },
    $queryRaw: mocks.queryRaw,
  },
}))

import WarehouseDashboard from "../warehouse-dashboard"

const move = {
  id: 1,
  qty: 3,
  moveType: "OUT",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  item: { name: "Busi Iridium", sku: "BSI-01" },
  warehouse: { name: "Gudang Cabang" },
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderDashboard(user: { id: string; roles: string[] }) {
  const node = await WarehouseDashboard({ user })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(node)
  })
  return container
}

describe("WarehouseDashboard scope (putaran 77)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stockMoveFindMany.mockResolvedValue([move])
    mocks.goodsReceiptCount.mockResolvedValue(5)
    mocks.warehouseCount.mockResolvedValue(9)
    mocks.itemCount.mockResolvedValue(40)
    mocks.queryRaw.mockResolvedValue([])
    mocks.layerGroupBy.mockResolvedValue([])
    mocks.layerFindMany.mockResolvedValue([])
    mocks.settingFindMany.mockResolvedValue([])
    mocks.itemFindMany.mockResolvedValue([])
  })

  afterEach(() => {
    if (root) act(() => root!.unmount())
    root = null
    container?.remove()
    container = null
  })

  it("scope none: tidak menampilkan mutasi/penerimaan lintas gudang", async () => {
    mocks.userWarehouseFindMany.mockResolvedValue([])

    const el = await renderDashboard({ id: "7", roles: ["warehouse"] })

    expect(el.textContent).not.toContain("Busi Iridium")
    expect(mocks.stockMoveFindMany).not.toHaveBeenCalled()
    expect(mocks.goodsReceiptCount).not.toHaveBeenCalled()
  })

  it("scope assigned: query mutasi dan penerimaan disaring ke gudang sendiri", async () => {
    mocks.userWarehouseFindMany.mockResolvedValue([{ warehouseId: 4 }])

    const el = await renderDashboard({ id: "7", roles: ["warehouse"] })

    expect(mocks.stockMoveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "posted", warehouseId: { in: [4] } } }),
    )
    expect(mocks.goodsReceiptCount).toHaveBeenCalledWith({
      where: { status: "draft", warehouseId: { in: [4] } },
    })
    expect(el.textContent).toContain("Busi Iridium")
  })

  it("low-stock assigned dihitung dari sisa layer per gudang, bukan qtyOnHand global", async () => {
    mocks.userWarehouseFindMany.mockResolvedValue([{ warehouseId: 4 }])
    mocks.layerGroupBy.mockResolvedValue([{ itemId: 2, _sum: { remaining: 1 } }])
    mocks.layerFindMany.mockResolvedValue([{ itemId: 2 }])
    mocks.itemFindMany.mockResolvedValue([
      { id: 2, name: "Kampas Rem", sku: "KPR-02", minStock: 10 },
    ])

    const el = await renderDashboard({ id: "7", roles: ["warehouse"] })

    expect(el.textContent).toContain("Kampas Rem")
    expect(mocks.layerGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { warehouseId: { in: [4] }, remaining: { gt: 0 } } }),
    )
  })
})
