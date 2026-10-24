// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { WorkOrderReservationsCard } from "../work-order-reservations-card"
import {
  buildWorkOrderReservationRow,
  buildUnreservedNeedRow,
} from "@/lib/reports/stock-reservation-release"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const releasedRow = buildWorkOrderReservationRow({
  id: 7,
  itemName: "Kampas Rem",
  warehouseName: "Gudang Utama",
  qtyReserved: 4,
  qtyConsumed: 1,
  status: "released",
  expiresAt: null,
  releasedAt: new Date(2026, 9, 20),
  releasedByName: "Salsa",
  releaseReason: "WO dibatalkan",
})

const activeRow = buildWorkOrderReservationRow({
  id: 8,
  itemName: "Oli Mesin",
  warehouseName: "Gudang Utama",
  qtyReserved: 2,
  qtyConsumed: 0,
  status: "active",
  expiresAt: null,
  releasedAt: null,
  releasedByName: null,
  releaseReason: null,
})

describe("WorkOrderReservationsCard F-057-S AC-RIL-5", () => {
  it("render passthrough baris: parsial tetap Dilepas + sisa builder + jejak rilis verbatim", () => {
    const { container, root } = renderCard(
      <WorkOrderReservationsCard reservations={{ rows: [releasedRow, activeRow], unreserved: [] }} />,
    )
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Reservasi Stok"]')).not.toBeNull()
    expect(text).toContain("Kampas Rem")
    expect(text).toContain("Gudang Utama")
    // parsial: reserved 4 consumed 1 -> sisa 3 dari builder, label Dilepas
    expect(releasedRow.remainingQty).toBe(3)
    expect(text).toContain("Dilepas")
    expect(text).toContain("oleh Salsa")
    expect(text).toContain("WO dibatalkan")
    expect(text).toContain("20/10/2026")
    // aktif: belum dirilis -> "-"
    expect(text).toContain("Terreservasi")
    expect(text).toContain("2 reservasi tercatat")
    unmountCard(root)
  })

  it("baris gudang-belum-ditentukan tampil label verbatim, BUKAN Dilepas", () => {
    const unreserved = [buildUnreservedNeedRow({ itemName: "Busi Iridium", remainingQty: 3 })]
    const { container, root } = renderCard(
      <WorkOrderReservationsCard reservations={{ rows: [], unreserved }} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Busi Iridium")
    expect(text).toContain("Belum direservasi — gudang belum ditentukan")
    expect(text).not.toContain("Dilepas")
    expect(text).toContain("Kebutuhan tanpa reservasi")
    unmountCard(root)
  })

  it("kosong tampil pesan belum ada reservasi", () => {
    const { container, root } = renderCard(
      <WorkOrderReservationsCard reservations={{ rows: [], unreserved: [] }} />,
    )
    expect(container.textContent).toContain("Belum ada reservasi stok untuk perintah kerja ini")
    unmountCard(root)
  })
})
