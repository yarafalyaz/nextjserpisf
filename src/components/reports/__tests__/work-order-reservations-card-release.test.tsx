// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/actions/manufacturing.actions", () => ({
  releaseStockReservation: vi.fn(async () => ({ success: true })),
}))

import { WorkOrderReservationsCard } from "../work-order-reservations-card"
import type { WorkOrderReservations } from "@/lib/reports/work-order-reservations-data"
import { renderCard } from "./card-test-utils"

/**
 * Regresi putaran 233: BR-RES-09 / AC-RES-6 menyebut pelepasan reservasi
 * manual sebagai fitur (alasan wajib, jejak siapa/kapan), tetapi
 * `releaseStockReservation` tidak punya pemanggil UI sama sekali — reservasi
 * aktif yang sudah tidak dibutuhkan tetap menahan stok sampai lazy-expire
 * 14 hari. Kartu reservasi kini menawarkan tombol Lepas per baris aktif.
 */
const baseRow = {
  id: 11,
  itemName: "Busi Iridium",
  warehouseName: "Gudang Utama",
  qtyReserved: 10,
  qtyConsumed: 2,
  remainingQty: 8,
  status: "active",
  statusLabel: "Aktif",
  expiresAt: null as Date | null,
  releasedAt: null as Date | null,
  releasedByName: null as string | null,
  releaseReason: null as string | null,
}

const payload = (rows: (typeof baseRow)[]): WorkOrderReservations => ({
  rows,
  unreserved: [],
})

describe("WorkOrderReservationsCard — pelepasan reservasi (BR-RES-09)", () => {
  it("tanpa canRelease tidak menampilkan kolom Aksi maupun tombol", () => {
    const { container } = renderCard(
      <WorkOrderReservationsCard reservations={payload([baseRow])} />,
    )
    expect(container.textContent ?? "").not.toContain("Aksi")
    expect(container.textContent ?? "").not.toContain("Lepas")
  })

  it("canRelease menampilkan tombol Lepas untuk baris aktif", () => {
    const { container } = renderCard(
      <WorkOrderReservationsCard reservations={payload([baseRow])} canRelease />,
    )
    expect(container.textContent ?? "").toContain("Aksi")
    expect(container.textContent ?? "").toContain("Lepas")
  })

  it("baris yang sudah dilepas tidak menawarkan Lepas lagi", () => {
    const released = {
      ...baseRow,
      id: 12,
      status: "released",
      statusLabel: "Dilepas",
      releasedAt: new Date("2026-10-01T00:00:00Z"),
    }
    const { container } = renderCard(
      <WorkOrderReservationsCard reservations={payload([released])} canRelease />,
    )
    expect(container.textContent ?? "").not.toContain("Lepas")
  })

  it("baris kedaluwarsa juga tidak menawarkan Lepas", () => {
    const expired = { ...baseRow, id: 13, status: "expired", statusLabel: "Kedaluwarsa" }
    const { container } = renderCard(
      <WorkOrderReservationsCard reservations={payload([expired])} canRelease />,
    )
    expect(container.textContent ?? "").not.toContain("Lepas")
  })
})
