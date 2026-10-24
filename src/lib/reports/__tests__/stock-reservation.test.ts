import { describe, it, expect } from "vitest"
import {
  planReservationsAtStart,
  planReservationConsumption,
  reservationExpiresAt,
  reservationStatusLabel,
  RESERVATION_LABEL_EXPIRED,
  RESERVATION_LABEL_NO_WAREHOUSE,
  RESERVATION_LABEL_SHORTAGE_OTHER_WO,
  RESERVATION_LABEL_UNRESERVED_OUTFLOW,
  type ReservationNeedLine,
} from "../stock-reservation"

/**
 * F-2026-10-21-012 inti (AC-RES-1/3/5/7 + edge Decimal): perencana murni
 * reservasi. Falsifikasi: balik penjaga isolasi/kekurangan → MERAH.
 */

const START = new Date(2026, 9, 22)

function line(partial: Partial<ReservationNeedLine>): ReservationNeedLine {
  return {
    workOrderItemId: 1,
    itemId: 10,
    requiredQty: 1,
    issuedQty: 0,
    status: "pending",
    defaultWarehouseId: 5,
    ...partial,
  }
}

describe("planReservationsAtStart", () => {
  it("AC-RES-1: stok 1, WO pertama penuh, WO kedua parsial 0 + shortage", () => {
    const first = planReservationsAtStart({
      lines: [line({})],
      materialIssueWarehouseId: null,
      onHandAt: () => 1,
      reservedByOthersAt: () => 0,
      startDate: START,
      endDate: null,
    })
    expect(first.reservations[0]).toMatchObject({ qtyReserved: 1, shortageQty: 0 })

    const second = planReservationsAtStart({
      lines: [line({ workOrderItemId: 2 })],
      materialIssueWarehouseId: null,
      onHandAt: () => 1,
      // WO pertama sudah mengikat 1 unit di gudang sama.
      reservedByOthersAt: () => 1,
      startDate: START,
      endDate: null,
    })
    expect(second.reservations[0]).toMatchObject({ qtyReserved: 0, shortageQty: 1 })
    expect(RESERVATION_LABEL_SHORTAGE_OTHER_WO).toBe(
      "Stok gudang ini sudah terreservasi untuk perintah kerja lain",
    )
  })

  it("AC-RES-7: jasa itemId=0, replaced, gudang kosong tak lahir", () => {
    const plan = planReservationsAtStart({
      lines: [
        line({ workOrderItemId: 1, itemId: 0 }),
        line({ workOrderItemId: 2, status: "replaced" }),
        line({ workOrderItemId: 3, itemId: 11, defaultWarehouseId: null }),
      ],
      materialIssueWarehouseId: null,
      onHandAt: () => 99,
      reservedByOthersAt: () => 0,
      startDate: START,
      endDate: null,
    })
    expect(plan.reservations).toEqual([])
    expect(plan.unreserved).toHaveLength(1)
    expect(plan.unreserved[0]).toMatchObject({ itemId: 11, label: RESERVATION_LABEL_NO_WAREHOUSE })
    expect(RESERVATION_LABEL_NO_WAREHOUSE).toBe("Belum direservasi — gudang belum ditentukan")
  })

  it("gudang MI menang atas default item; sisa kebutuhan = qty - issued", () => {
    const plan = planReservationsAtStart({
      lines: [line({ requiredQty: 5, issuedQty: 2 })],
      materialIssueWarehouseId: 7,
      onHandAt: (_i, w) => (w === 7 ? 10 : 0),
      reservedByOthersAt: () => 0,
      startDate: START,
      endDate: null,
    })
    expect(plan.reservations[0]).toMatchObject({ warehouseId: 7, qtyReserved: 3, shortageQty: 0 })
  })

  it("dua baris item sama berbagi ketersediaan dalam satu rencana", () => {
    const plan = planReservationsAtStart({
      lines: [line({ workOrderItemId: 1 }), line({ workOrderItemId: 2 })],
      materialIssueWarehouseId: null,
      onHandAt: () => 1,
      reservedByOthersAt: () => 0,
      startDate: START,
      endDate: null,
    })
    expect(plan.reservations.map((r) => r.qtyReserved)).toEqual([1, 0])
    expect(plan.reservations[1].shortageQty).toBe(1)
  })

  it("qty desimal Decimal 15,2: butuh 2.50 tersedia 1.25 → reserved 1.25 shortage 1.25", () => {
    const plan = planReservationsAtStart({
      lines: [line({ requiredQty: 2.5 })],
      materialIssueWarehouseId: null,
      onHandAt: () => 1.25,
      reservedByOthersAt: () => 0,
      startDate: START,
      endDate: null,
    })
    expect(plan.reservations[0].qtyReserved).toBeCloseTo(1.25, 9)
    expect(plan.reservations[0].shortageQty).toBeCloseTo(1.25, 9)
  })
})

describe("reservationExpiresAt (AC-RES-5 dasar + edge tanpa endDate)", () => {
  it("endDate lebih awal menang; tanpa endDate → start + 14 hari", () => {
    const early = new Date(2026, 9, 25)
    expect(reservationExpiresAt(START, early).getTime()).toBe(early.getTime())
    const plus14 = reservationExpiresAt(START, null)
    expect(plus14.getDate()).toBe(5) // 22 Okt + 14 = 5 Nov
    expect(plus14.getMonth()).toBe(10)
  })

  it("label kedaluwarsa persis spec §2(g)", () => {
    expect(reservationStatusLabel("expired")).toBe(RESERVATION_LABEL_EXPIRED)
    expect(RESERVATION_LABEL_EXPIRED).toBe("Kedaluwarsa — reservasi ulang bila masih dibutuhkan")
    expect(reservationStatusLabel("active")).toBe("Terreservasi")
    expect(reservationStatusLabel("consumed")).toBe("Terpakai Habis")
    expect(reservationStatusLabel("released")).toBe("Dilepas")
  })
})

describe("planReservationConsumption (AC-RES-2/3)", () => {
  it("tanpa reservasi pemilik: semua keluar tanpa cadangan, tak sentuh WO lain", () => {
    const plan = planReservationConsumption({ activeRemaining: null, qty: 3 })
    expect(plan).toEqual({ consumedFromReservation: 0, overReservedQty: 3, nextStatus: null })
    expect(RESERVATION_LABEL_UNRESERVED_OUTFLOW).toBe("Keluar tanpa cadangan reservasi")
  })

  it("melebihi sisa: consumed habis + kelebihan tanpa cadangan", () => {
    const plan = planReservationConsumption({ activeRemaining: 2, qty: 5 })
    expect(plan.consumedFromReservation).toBe(2)
    expect(plan.overReservedQty).toBe(3)
    expect(plan.nextStatus).toBe("consumed")
  })

  it("sebagian: tetap active berkurang", () => {
    const plan = planReservationConsumption({ activeRemaining: 4.5, qty: 1.5 })
    expect(plan.consumedFromReservation).toBeCloseTo(1.5, 9)
    expect(plan.overReservedQty).toBe(0)
    expect(plan.nextStatus).toBe("active")
  })
})
