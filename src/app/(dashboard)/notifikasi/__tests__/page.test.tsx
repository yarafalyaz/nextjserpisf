// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({ requireAuth: mocks.requireAuth }))
vi.mock("@/lib/db/prisma", () => ({
  prisma: { notification: { findMany: mocks.findMany, count: mocks.count } },
}))
vi.mock("@/components/ui/breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}))

import NotificationsPage from "../page"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue({ id: "7" })
  // 50 terbaru semuanya sudah dibaca, tetapi DB masih punya 80 unread lama.
  mocks.findMany.mockResolvedValue(
    Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      title: `N${i}`,
      body: "isi",
      readAt: new Date(),
      createdAt: new Date(),
    })),
  )
  mocks.count.mockResolvedValue(80)
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("halaman notifikasi", () => {
  it("R6WN-10: angka belum dibaca dari count DB, bukan jendela 50 terbaru", async () => {
    const node = await NotificationsPage()
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => root.render(node))
    expect(container.textContent).toContain("80 belum dibaca")
    expect(mocks.count).toHaveBeenCalledWith({
      where: { userId: 7, readAt: null },
    })
    act(() => root.unmount())
  })

  it("R6WN-10: body path-only menjadi link dokumen, teks biasa tetap teks", async () => {
    mocks.findMany.mockResolvedValue([
      { id: 1, title: "Penawaran diterima", body: "/penjualan/penawaran/5", readAt: null, createdAt: new Date() },
      { id: 2, title: "Stok menipis", body: "Stok Oli tinggal 2", readAt: null, createdAt: new Date() },
    ])
    const node = await NotificationsPage()
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => root.render(node))
    const link = container.querySelector('a[href="/penjualan/penawaran/5"]')
    expect(link?.textContent).toContain("Buka dokumen terkait")
    expect(container.textContent).toContain("Stok Oli tinggal 2")
    expect(container.querySelector('a[href="/penjualan/penawaran/5"]')?.closest("div")).not.toBeNull()
    act(() => root.unmount())
  })
})
