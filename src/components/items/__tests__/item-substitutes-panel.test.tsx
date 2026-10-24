// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(async () => ({ success: true as const, id: 9 })),
  setActive: vi.fn(async () => ({ success: true as const })),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/item-substitute.actions", () => ({
  listItemSubstitutes: (...args: unknown[]) => mocks.list(...(args as [])),
  createItemSubstitute: (...args: unknown[]) => mocks.create(...(args as [])),
  setItemSubstituteActive: (...args: unknown[]) => mocks.setActive(...(args as [])),
  applyWorkOrderItemSubstitute: vi.fn(async () => ({ success: true, releaseNotice: null })),
  getSubstituteSuggestionsForWorkOrder: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => mocks.showError(...args),
  showSuccess: (...args: unknown[]) => mocks.showSuccess(...args),
}))

import { ItemSubstitutesPanel, type ItemSubstituteRow } from "../item-substitutes-panel"
import { renderCard, unmountCard, clickButtonByText } from "../../reports/__tests__/card-test-utils"

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllMocks()
})

function row(extra: Partial<ItemSubstituteRow> = {}): ItemSubstituteRow {
  return {
    id: 3,
    itemId: 100,
    substituteItemId: 200,
    substituteName: "Kampas Rem Alternatif",
    substituteSku: "KB-ALT",
    substituteUnitOfMeasure: "pcs",
    substituteIsActive: true,
    notes: "setara fungsi",
    isActive: true,
    createdAt: new Date("2026-10-23T00:00:00"),
    ...extra,
  }
}

async function renderLoaded(rows: ItemSubstituteRow[], canManage = true) {
  mocks.list.mockResolvedValue({ success: true, substitutes: rows })
  const rendered = renderCard(
    <ItemSubstitutesPanel
      itemId={100}
      itemOptions={[
        { id: 100, label: "Kampas Rem (KB-001)" },
        { id: 200, label: "Kampas Rem Alternatif (KB-ALT)" },
      ]}
      canManage={canManage}
    />,
  )
  await act(async () => {})
  return rendered
}

describe("ItemSubstitutesPanel F-2026-10-22-069-S", () => {
  it("AC-SUB69-5: daftar aktif + nonaktif redup tampil; nonaktif ada tombol Aktifkan kembali", async () => {
    const { container, root } = await renderLoaded([
      row(),
      row({ id: 4, substituteName: "Kampas Lama", substituteSku: "KB-LAMA", isActive: false }),
    ])
    const text = container.textContent ?? ""
    expect(text).toContain("Kampas Rem Alternatif")
    expect(text).toContain("Kampas Lama")
    expect(text).toContain("Nonaktif")
    expect(container.innerHTML).toContain("opacity-60")
    expect(text).toContain("Nonaktifkan")
    expect(text).toContain("Aktifkan kembali")
    unmountCard(root)
  })

  it("kosong: teks belum ada substitusi", async () => {
    const { container, root } = await renderLoaded([])
    expect(container.textContent).toContain("Belum ada substitusi tercatat untuk barang ini")
    unmountCard(root)
  })

  it("error server tampil verbatim", async () => {
    mocks.list.mockResolvedValue({ success: false, error: "Barang asal tidak ditemukan atau sudah nonaktif" })
    const { container, root } = renderCard(
      <ItemSubstitutesPanel itemId={100} itemOptions={[]} canManage />,
    )
    await act(async () => {})
    expect(container.textContent).toContain("Barang asal tidak ditemukan atau sudah nonaktif")
    unmountCard(root)
  })

  it("tanpa edit_items: tombol kelola tidak tampil + catatan izin tampil", async () => {
    const { container, root } = await renderLoaded([row()], false)
    const text = container.textContent ?? ""
    expect(text).not.toContain("Tambah Substitusi")
    expect(text).not.toContain("Nonaktifkan")
    expect(text).toContain("Hanya pengguna berizin edit_items")
    unmountCard(root)
  })

  it("nonaktifkan memanggil setItemSubstituteActive isActive=false", async () => {
    const { container, root } = await renderLoaded([row()])
    await act(async () => {
      clickButtonByText(container, "Nonaktifkan")
    })
    expect(mocks.setActive).toHaveBeenCalledWith({ id: 3, isActive: false })
    unmountCard(root)
  })

  it("render statis awal: status memuat tampil sebelum data datang", () => {
    mocks.list.mockReturnValue(new Promise(() => {}))
    const html = renderToStaticMarkup(
      <ItemSubstitutesPanel itemId={100} itemOptions={[]} canManage />,
    )
    expect(html).toContain("Substitusi")
  })
})
