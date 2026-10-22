import { describe, it, expect } from "vitest"
import {
  reservationReleaseNotice,
  buildWorkOrderReservationRow,
  buildUnreservedNeedRow,
} from "../stock-reservation-release"
import { RESERVATION_LABEL_NO_WAREHOUSE } from "../stock-reservation"

/**
 * F-2026-10-22-057-S (BOT 5) AC-RIL-1..4/6 lapis builder: kata verbatim
 * §1 per transisi, passthrough tiga angka kasus parsial §2, baris
 * gudang-belum-ditentukan bukan rilis §2/AC-RIL-4.
 */

describe("reservationReleaseNotice (kata §1 verbatim)", () => {
  it("complete/close/cancel/revise dengan sisa terlepas", () => {
    expect(reservationReleaseNotice("complete", 2)).toBe(
      "Selesai — 2 reservasi sisa dilepas",
    )
    expect(reservationReleaseNotice("close", 1)).toBe(
      "Ditutup — 1 reservasi sisa dilepas",
    )
    expect(reservationReleaseNotice("cancel", 3)).toBe(
      "Dibatalkan — 3 reservasi sisa dilepas karena pembatalan",
    )
    expect(reservationReleaseNotice("revise", 1)).toBe(
      "Revisi — 1 reservasi baris terdampak dilepas",
    )
  })

  it("AC-RIL-3: 0 baris (no-op jujur) → tanpa pemberitahuan di semua transisi", () => {
    for (const t of ["complete", "close", "cancel", "revise"] as const) {
      expect(reservationReleaseNotice(t, 0)).toBeNull()
    }
  })
})

describe("buildWorkOrderReservationRow (§2 passthrough)", () => {
  it("AC-RIL-1 kasus parsial: tiga angka utuh, label tetap Dilepas (tanpa label karangan)", () => {
    const row = buildWorkOrderReservationRow({
      id: 5,
      itemName: "Oli",
      warehouseName: "Gudang A",
      qtyReserved: 10,
      qtyConsumed: 4,
      status: "released",
      expiresAt: null,
      releasedAt: new Date(2026, 9, 22),
      releasedByName: "Budi",
      releaseReason: "Perintah kerja selesai",
    })
    expect(row.qtyReserved).toBe(10)
    expect(row.qtyConsumed).toBe(4)
    expect(row.remainingQty).toBe(6)
    expect(row.statusLabel).toBe("Dilepas")
    expect(row.releaseReason).toBe("Perintah kerja selesai")
  })

  it("AC-RIL-6: baris released tidak berubah oleh kedaluwarsa — label/releasedAt apa adanya", () => {
    const releasedAt = new Date(2026, 9, 20, 10, 0, 0)
    const row = buildWorkOrderReservationRow({
      id: 6,
      itemName: "Ban",
      warehouseName: "Gudang A",
      qtyReserved: 2,
      qtyConsumed: 2,
      status: "released",
      expiresAt: new Date(2026, 9, 19),
      releasedAt,
      releasedByName: "Budi",
      releaseReason: "Perintah kerja selesai",
    })
    expect(row.statusLabel).toBe("Dilepas")
    expect(row.releasedAt).toBe(releasedAt)
    expect(row.remainingQty).toBe(0)
  })

  it("baris active tampil expiresAt + label Terreservasi", () => {
    const row = buildWorkOrderReservationRow({
      id: 7,
      itemName: "Ban",
      warehouseName: "Gudang B",
      qtyReserved: 3,
      qtyConsumed: 0,
      status: "active",
      expiresAt: new Date(2026, 10, 5),
      releasedAt: null,
      releasedByName: null,
      releaseReason: null,
    })
    expect(row.statusLabel).toBe("Terreservasi")
    expect(row.remainingQty).toBe(3)
  })
})

describe("buildUnreservedNeedRow (AC-RIL-4)", () => {
  it("gudang belum ditentukan: kata #437, bukan Dilepas", () => {
    const row = buildUnreservedNeedRow({ itemName: "Filter", remainingQty: 2 })
    expect(row.statusLabel).toBe(RESERVATION_LABEL_NO_WAREHOUSE)
    expect(row.statusLabel).not.toBe("Dilepas")
  })
})
