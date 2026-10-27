import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  DP_QUEUE_LEVEL_LABELS,
  buildDownPaymentVerificationQueue,
  type DownPaymentQueueDpInput,
} from "../down-payment-verification-queue"
import { dpQueueDp, dpQueueQuotation } from "./down-payment-verification-queue-fixtures"

/**
 * F-2026-10-26-051-S builder — AC-DPQ-1..10 / EC-DPQ-1..8 (lapis builder).
 * Now tetap: 2026-10-26 WIB = 2026-10-25T20:00Z (hari ini WIB 26 Okt).
 */
const NOW = new Date("2026-10-25T20:00:00.000Z")

const dp = (
  partial: Partial<DownPaymentQueueDpInput> & { downPaymentId: number },
) => dpQueueDp(partial)
const quotation = dpQueueQuotation

describe("buildDownPaymentVerificationQueue", () => {
  it("AC-DPQ-1: draft hari ini bukti ada potensi>0 = menunggu, umur 0 dari createdAt bukan paymentDate", () => {
    // paymentDate 10 hari lalu; umur wajib tetap 0 (BR-DPQ-11).
    const queue = buildDownPaymentVerificationQueue(
      [
        dp({
          downPaymentId: 1,
          amount: 10_000_000,
          paymentDate: new Date("2026-10-15T00:00:00.000Z"),
        }),
      ],
      [quotation()],
      { now: NOW },
    )
    expect(queue.rows).toHaveLength(1)
    const row = queue.rows[0]
    expect(row.tingkat).toBe("menunggu")
    expect(row.tingkatLabel).toBe(DP_QUEUE_LEVEL_LABELS.menunggu)
    expect(row.umurMenungguHari).toBe(0)
    expect(row.ambangSen).toBe(5_000_000_000)
    expect(row.jarakSen).toBe(5_000_000_000)
    expect(row.adaBukti).toBe(true)
    expect(row).not.toHaveProperty("proofImage")
  })

  it("AC-DPQ-2: confirmed 40% + draft 15% ambang 50% = membuka_invoice, belum terhitung sebelum konfirmasi", () => {
    const queue = buildDownPaymentVerificationQueue(
      [
        dp({ downPaymentId: 1, amount: 40_000_000, status: "confirmed" }),
        dp({ downPaymentId: 2, amount: 15_000_000 }),
      ],
      [quotation()],
      { now: NOW },
    )
    expect(queue.rows).toHaveLength(1)
    const row = queue.rows[0]
    expect(row.tingkat).toBe("membuka_invoice")
    expect(row.jarakTeks).toBe("Cukup dengan konfirmasi baris ini")
    // confirmedSen tetap 40% — draft tidak dijumlahkan (BR-DPQ-05).
    expect(row.confirmedSen).toBe(4_000_000_000)
    expect(row.jarakSen).toBe(1_000_000_000)
  })

  it("AC-DPQ-3: dua draft 10%+10% confirmed 35% ambang 50% — tidak satu pun membuka_invoice, menungguLain terpisah", () => {
    const queue = buildDownPaymentVerificationQueue(
      [
        dp({ downPaymentId: 1, amount: 35_000_000, status: "confirmed" }),
        dp({ downPaymentId: 2, amount: 10_000_000 }),
        dp({ downPaymentId: 3, amount: 10_000_000 }),
      ],
      [quotation()],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.tingkat)).toEqual(["menunggu", "menunggu"])
    for (const row of queue.rows) {
      expect(row.menungguSen).toBe(2_000_000_000)
      expect(row.menungguLainSen).toBe(1_000_000_000)
    }
    // Rekap menunggu dihitung sekali per baris populasi (EC-DPQ-5).
    expect(queue.summary.totalAmountSen).toBe(2_000_000_000)
  })

  it("AC-DPQ-4: snapshot kosong/korup mengikuti fail-closed helper existing (50 + label default), bukan crash", () => {
    for (const snap of [null, 0, 150] as const) {
      const queue = buildDownPaymentVerificationQueue(
        [dp({ downPaymentId: 1 })],
        [quotation({ invoiceThresholdPercent: snap })],
        { now: NOW },
      )
      expect(queue.rows[0].persenAmbangEfektif).toBe(50)
      expect(queue.rows[0].ambangSumberLabel).toBe("Ambang invoice default: 50%")
    }
    const sah = buildDownPaymentVerificationQueue(
      [dp({ downPaymentId: 1 })],
      [quotation({ invoiceThresholdPercent: 30 })],
      { now: NOW },
    )
    expect(sah.rows[0].persenAmbangEfektif).toBe(30)
    expect(sah.rows[0].ambangSen).toBe(3_000_000_000)
  })

  it("AC-DPQ-5: draft tanpa bukti — penanda belum ada, tingkat normal, baris tidak hilang", () => {
    const queue = buildDownPaymentVerificationQueue(
      [dp({ downPaymentId: 1, adaBukti: false })],
      [quotation()],
      { now: NOW },
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].buktiLabel).toBe("Bukti belum ada")
    expect(queue.rows[0].tingkat).toBe("menunggu")
    expect(queue.summary.tanpaBukti).toBe(1)
  })

  it("AC-DPQ-8: draft sangat lama tetap menunggu biasa — tingkat menunggu_lama tidak diterbitkan tanpa vonis Q-DPQ-1", () => {
    const queue = buildDownPaymentVerificationQueue(
      [
        dp({
          downPaymentId: 1,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      ],
      [quotation()],
      { now: NOW },
    )
    expect(queue.rows[0].tingkat).toBe("menunggu")
    expect(queue.rows[0].umurMenungguHari).toBeGreaterThan(200)
  })

  it("AC-DPQ-9: pending warisan/status tak dikenal tidak masuk baris, terhitung tak_terklasifikasi", () => {
    const queue = buildDownPaymentVerificationQueue(
      [
        dp({ downPaymentId: 1, status: "pending" }),
        dp({ downPaymentId: 2, status: "cancelled" }),
        dp({ downPaymentId: 3, status: "confirmed" }),
        dp({ downPaymentId: 4, status: "aneh" }),
        dp({ downPaymentId: 5 }),
      ],
      [quotation()],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.downPaymentId)).toEqual([5])
    expect(queue.summary.takTerklasifikasi).toBe(3)
    // confirmed tidak masuk takTerklasifikasi dan tidak masuk baris.
    expect(queue.summary.total).toBe(1)
  })

  it("EC-DPQ-1: grandTotal 0 — tanpa acuan ambang, tidak diklaim membuka invoice", () => {
    const queue = buildDownPaymentVerificationQueue(
      [dp({ downPaymentId: 1, amount: 1 })],
      [quotation({ grandTotal: 0 })],
      { now: NOW },
    )
    expect(queue.rows[0].tanpaAcuanAmbang).toBe(true)
    expect(queue.rows[0].tingkat).toBe("menunggu")
    expect(queue.rows[0].jarakSen).toBe(0)
  })

  it("EC-DPQ-2: confirmed >= ambang — jarakTeks ambang tercapai, baris tetap menunggu verifikasi", () => {
    const queue = buildDownPaymentVerificationQueue(
      [
        dp({ downPaymentId: 1, amount: 60_000_000, status: "confirmed" }),
        dp({ downPaymentId: 2, amount: 5_000_000 }),
      ],
      [quotation()],
      { now: NOW },
    )
    expect(queue.rows[0].jarakTeks).toBe(
      "Ambang sudah tercapai (faktur dinilai mesin konfirmasi)",
    )
    expect(queue.rows[0].tingkat).toBe("menunggu")
  })

  it("EC-DPQ-4: createdAt masa depan — umur clamp 0, bukan negatif", () => {
    const queue = buildDownPaymentVerificationQueue(
      [
        dp({
          downPaymentId: 1,
          createdAt: new Date("2026-11-01T00:00:00.000Z"),
        }),
      ],
      [quotation()],
      { now: NOW },
    )
    expect(queue.rows[0].umurMenungguHari).toBe(0)
  })

  it("EC-DPQ-3: status quotation verbatim ikut baris (cancelled tidak disembunyikan)", () => {
    const queue = buildDownPaymentVerificationQueue(
      [dp({ downPaymentId: 1 })],
      [quotation({ quotationStatus: "cancelled" })],
      { now: NOW },
    )
    expect(queue.rows[0].quotationStatus).toBe("cancelled")
  })
})

/**
 * Loader — gerbang fail-closed + payload tanpa path bukti.
 */
const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findDownPayments: vi.fn(),
  findQuotations: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    downPayment: { findMany: (...a: unknown[]) => mocks.findDownPayments(...a) },
    quotation: { findMany: (...a: unknown[]) => mocks.findQuotations(...a) },
  },
}))

import { getDownPaymentVerificationQueue } from "../down-payment-verification-queue-data"

describe("getDownPaymentVerificationQueue (loader)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.findDownPayments.mockResolvedValue([])
    mocks.findQuotations.mockResolvedValue([])
  })

  it("AC-DPQ-6: tanpa view_down_payments loader gagal sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getDownPaymentVerificationQueue({ now: NOW })).rejects.toThrow(
      "Tidak memiliki izin",
    )
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_down_payments")
    expect(mocks.findDownPayments).not.toHaveBeenCalled()
    expect(mocks.findQuotations).not.toHaveBeenCalled()
  })

  it("payload baris hanya boolean bukti — path proofImage tidak bocor", async () => {
    mocks.findDownPayments.mockResolvedValue([
      {
        id: 9,
        documentNo: "DP-009",
        quotationId: 1,
        customerId: 7,
        amount: { toString: () => "10000000" },
        paymentDate: new Date("2026-10-25T00:00:00.000Z"),
        paymentMethod: "transfer",
        proofImage: "/uploads/dp/rahasia.jpg",
        status: "draft",
        createdAt: new Date("2026-10-25T20:00:00.000Z"),
        customer: { name: "CV Uji" },
      },
    ])
    mocks.findQuotations.mockResolvedValue([
      {
        id: 1,
        documentNo: "Q-001",
        status: "accepted",
        grandTotal: { toString: () => "100000000" },
        invoiceThresholdPercent: { toString: () => "50" },
      },
    ])
    const queue = await getDownPaymentVerificationQueue({ now: NOW })
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].adaBukti).toBe(true)
    expect(JSON.stringify(queue)).not.toContain("rahasia.jpg")
    expect(queue.rows[0].amount).toBe(10_000_000)
  })
})
