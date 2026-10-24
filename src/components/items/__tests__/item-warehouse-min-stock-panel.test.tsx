// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  setMin: vi.fn(async () => ({ success: true, settingId: 7 })),
  remove: vi.fn(async () => ({ success: true, removed: true })),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/item-warehouse-setting.actions", () => ({
  listItemWarehouseSettings: (...args: unknown[]) => mocks.list(...(args as [])),
  setItemWarehouseMinStock: (...args: unknown[]) => mocks.setMin(...(args as [])),
  removeItemWarehouseMinStock: (...args: unknown[]) => mocks.remove(...(args as [])),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { ItemWarehouseMinStockPanel } from "../item-warehouse-min-stock-panel"
import type { ItemWarehouseSettingRow } from "@/actions/item-warehouse-setting.actions"
import {
  renderCard,
  unmountCard,
  clearRenderedCards,
  setFieldValue,
  clickButtonByText,
} from "../../reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
  vi.clearAllMocks()
})

function row(extra: Partial<ItemWarehouseSettingRow> = {}): ItemWarehouseSettingRow {
  return {
    warehouseId: 2,
    warehouseName: "Gudang Bengkel",
    warehouseCode: "GB",
    qtyAtWarehouse: 3,
    effectiveMinStock: 5,
    overrideMinStock: 5,
    globalMinStock: 10,
    minStockSource: "override",
    settingId: 7,
    ...extra,
  }
}

async function renderLoaded(rows: ItemWarehouseSettingRow[], canManage = true) {
  mocks.list.mockResolvedValue({ success: true, globalMinStock: 10, rows })
  const rendered = renderCard(
    <ItemWarehouseMinStockPanel
      itemId={100}
      canManage={canManage}
      overrideLabel="Minimum per gudang"
      globalLabel="Minimum global (warisi)"
    />,
  )
  await act(async () => {})
  return rendered
}

describe("ItemWarehouseMinStockPanel F-2026-10-22-070-E", () => {
  it("baris override + warisi: label sumber verbatim, stok null tampil status, kontrol sesuai override", async () => {
    const { container, root } = await renderLoaded([
      row(),
      row({
        warehouseId: 1,
        warehouseName: "Gudang Pusat",
        warehouseCode: "GP",
        qtyAtWarehouse: null,
        effectiveMinStock: 10,
        overrideMinStock: null,
        minStockSource: "global",
        settingId: null,
      }),
    ])
    const text = container.textContent ?? ""
    expect(text).toContain("Gudang Bengkel")
    expect(text).toContain("Gudang Pusat")
    expect(text).toContain("Minimum per gudang")
    expect(text).toContain("Minimum global (warisi)")
    expect(text).toContain("tidak ada stok di gudang ini")
    // tombol hapus hanya pada baris override
    expect([...container.querySelectorAll("button")].filter((b) => b.textContent === "Hapus / Kembali ke global")).toHaveLength(1)
    expect(container.querySelector('[aria-label="Stok minimum di Gudang Pusat"]')).not.toBeNull()
    unmountCard(root)
  })

  it("tanpa izin edit: kontrol ubah tidak tampil, angka tetap tampil", async () => {
    const { container, root } = await renderLoaded([row()], false)
    expect(container.textContent).toContain("Minimum per gudang")
    expect(container.querySelector("input")).toBeNull()
    expect([...container.querySelectorAll("button")]).toHaveLength(0)
    unmountCard(root)
  })

  it("simpan memanggil aksi dengan nilai input; error server tampil verbatim via toast", async () => {
    const { container, root } = await renderLoaded([row()])
    setFieldValue(container, "#min-stock-gudang-2", "8")
    await act(async () => {
      clickButtonByText(container, "Simpan")
    })
    expect(mocks.setMin).toHaveBeenCalledWith(100, 2, 8)

    mocks.setMin.mockResolvedValueOnce({ success: false, error: "Gudang nonaktif tidak bisa diatur stok minimumnya" } as never)
    await act(async () => {
      clickButtonByText(container, "Simpan")
    })
    await act(async () => {})
    expect(mocks.showError).toHaveBeenCalledWith("Gudang nonaktif tidak bisa diatur stok minimumnya")
    unmountCard(root)
  })

  it("hapus override memanggil aksi remove", async () => {
    const { container, root } = await renderLoaded([row()])
    await act(async () => {
      clickButtonByText(container, "Hapus / Kembali ke global")
    })
    expect(mocks.remove).toHaveBeenCalledWith(100, 2)
    unmountCard(root)
  })

  it("nilai tidak sah ditolak di UI tanpa panggil server", async () => {
    const { container, root } = await renderLoaded([row()])
    setFieldValue(container, "#min-stock-gudang-2", "-3")
    await act(async () => {
      clickButtonByText(container, "Simpan")
    })
    expect(mocks.setMin).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith("Stok minimum per gudang wajib angka 0 atau lebih")
    unmountCard(root)
  })

  it("error muat server tampil verbatim", async () => {
    mocks.list.mockResolvedValue({ success: false, error: "Barang tidak ditemukan" })
    const { container, root } = renderCard(
      <ItemWarehouseMinStockPanel itemId={100} canManage overrideLabel="Minimum per gudang" globalLabel="Minimum global (warisi)" />,
    )
    await act(async () => {})
    expect(container.textContent).toContain("Barang tidak ditemukan")
    unmountCard(root)
  })

  it("tanpa gudang aktif: pesan kosong", async () => {
    const { container, root } = await renderLoaded([])
    expect(container.textContent).toContain("Belum ada gudang aktif untuk diatur stok minimumnya")
    unmountCard(root)
  })
})
