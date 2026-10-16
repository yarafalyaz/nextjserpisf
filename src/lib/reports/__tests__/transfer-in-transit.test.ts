import { describe, expect, it } from "vitest"

import {
  buildTransferInTransit,
  transferInTransitSummary,
} from "@/lib/reports/transfer-in-transit"

const asOf = new Date("2026-10-31T00:00:00.000Z")

function transfer(overrides: Partial<Parameters<typeof buildTransferInTransit>[0]["transfers"][number]> = {}) {
  return {
    documentNo: "TRF-1",
    date: new Date("2026-10-20T00:00:00.000Z"),
    sourceName: "Gudang Utama",
    destinationName: "Bengkel",
    items: [{ sku: "BRG-1", name: "Busi", unit: "PCS", qty: 10, unitCost: 1000 }],
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildTransferInTransit>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice" ? row.text : row.kind === "group" || row.kind === "total" ? row.label : row.cells.join(" | "),
    )
    .join("\n")
}

describe("buildTransferInTransit", () => {
  it("menghitung nilai dari qty × cost pergerakan dan menandai umur", () => {
    const result = buildTransferInTransit({ transfers: [transfer()], asOf, periodEndIsToday: true })

    expect(result.totals.transfers).toBe(1)
    expect(result.totals.value).toBe(10_000)
    expect(result.totals.estimatedLines).toBe(0)
    expect(texts(result)).toContain("Gudang Utama → Bengkel")
    expect(texts(result)).toContain("umur 11 hari")
    expect(texts(result)).toContain("Jumlah Nilai Dalam Perjalanan")
  })

  it("menyebut barang sudah keluar dari gudang asal dan belum masuk gudang tujuan", () => {
    const result = buildTransferInTransit({ transfers: [transfer()], asOf, periodEndIsToday: true })

    expect(texts(result)).toContain("sudah keluar dari gudang asal")
    expect(texts(result)).toContain("belum masuk gudang tujuan")
  })

  it("memperingatkan pemindahan yang mengendap lebih dari 60 hari", () => {
    const result = buildTransferInTransit({
      transfers: [
        transfer({ documentNo: "TRF-LAMA", date: new Date("2026-06-01T00:00:00.000Z") }),
        transfer({ documentNo: "TRF-BARU" }),
      ],
      asOf,
      periodEndIsToday: true,
    })

    expect(texts(result)).toContain("berumur lebih dari 60 hari")
  })

  it("menandai baris yang nilainya perkiraan karena pergerakan tidak ditemukan", () => {
    const result = buildTransferInTransit({
      transfers: [transfer({ items: [{ sku: null, name: "Busi", unit: null, qty: 3, unitCost: null }] })],
      asOf,
      periodEndIsToday: true,
    })

    expect(result.totals.estimatedLines).toBe(1)
    expect(result.totals.value).toBe(0)
    expect(texts(result)).toContain("perkiraan, bukan nilai pasti")
  })

  it("tidak menjumlahkan kuantitas lintas satuan", () => {
    const result = buildTransferInTransit({
      transfers: [
        transfer({
          items: [
            { sku: "A", name: "Busi", unit: "PCS", qty: 10, unitCost: 1000 },
            { sku: "B", name: "Oli", unit: "LITER", qty: 5, unitCost: 2000 },
          ],
        }),
      ],
      asOf,
      periodEndIsToday: true,
    })

    expect(texts(result)).toContain("TIDAK dijumlahkan")
    expect(result.totals.value).toBe(20_000)
  })

  it("periode kosong menghasilkan catatan, bukan tabel telanjang", () => {
    const result = buildTransferInTransit({ transfers: [], asOf, periodEndIsToday: true })

    expect(result.totals.transfers).toBe(0)
    expect(texts(result)).toContain("Tidak ada pemindahan barang yang masih dalam perjalanan")
    expect(transferInTransitSummary(result)).toContain("Tidak ada barang dalam perjalanan")
  })

  it("memberi catatan titik waktu bila periode bukan periode berjalan", () => {
    const result = buildTransferInTransit({ transfers: [transfer()], asOf, periodEndIsToday: false })

    expect(texts(result)).toContain("bukan periode berjalan")
  })

  it("mengelompokkan umur pada ember yang tepat", () => {
    const result = buildTransferInTransit({
      transfers: [transfer({ date: new Date("2026-10-25T00:00:00.000Z") })],
      asOf,
      periodEndIsToday: true,
    })
    const muda = result.aging.find((bucket) => bucket.label === "0–30 hari")

    expect(muda?.transfers).toBe(1)
    expect(muda?.value).toBe(10_000)
  })
})
