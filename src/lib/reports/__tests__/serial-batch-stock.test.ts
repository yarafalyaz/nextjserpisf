import { describe, expect, it } from "vitest"

import {
  buildSerialBatchStock,
  daysUntilExpiry,
  serialBatchSummary,
  type SerialBatchInput,
} from "@/lib/reports/serial-batch-stock"

const AS_OF = new Date(2026, 9, 15)

function record(overrides: Partial<SerialBatchInput> = {}): SerialBatchInput {
  return {
    kind: "serial",
    itemSku: "BRG-1",
    itemName: "Busi",
    warehouseName: "Gudang Utama",
    code: "SN-001",
    status: "available",
    qty: 1,
    manufacturingDate: null,
    expiryDate: null,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildSerialBatchStock>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice" ? row.text : row.kind === "group" ? row.label : row.kind === "data" ? row.cells.join(" | ") : "",
    )
    .join("\n")
}

describe("daysUntilExpiry", () => {
  it("menghitung sisa hari dan negatif saat sudah lewat", () => {
    expect(daysUntilExpiry(new Date(2026, 9, 25), AS_OF)).toBe(10)
    expect(daysUntilExpiry(new Date(2026, 9, 5), AS_OF)).toBe(-10)
  })

  it("mengembalikan null bila tanpa tanggal", () => {
    expect(daysUntilExpiry(null, AS_OF)).toBeNull()
  })
})

describe("buildSerialBatchStock", () => {
  it("mengelompokkan baris per gudang dan menandai jenisnya", () => {
    const result = buildSerialBatchStock({
      records: [
        record(),
        record({ kind: "batch", code: "B-01", status: null, qty: 40, warehouseName: "Gudang Cabang" }),
      ],
      asOf: AS_OF,
      trackedItems: 2,
    })

    expect(texts(result)).toContain("Gudang: Gudang Utama (1)")
    expect(texts(result)).toContain("Gudang: Gudang Cabang (1)")
    expect(texts(result)).toContain("Nomor Seri")
    expect(texts(result)).toContain("Batch")
    expect(result.totals.serials).toBe(1)
    expect(result.totals.batches).toBe(1)
  })

  it("menerjemahkan status nomor seri ke bahasa Indonesia", () => {
    const result = buildSerialBatchStock({ records: [record({ status: "available" })], asOf: AS_OF, trackedItems: 1 })

    expect(texts(result)).toContain("Tersedia")
  })

  it("menghitung batch kedaluwarsa dan yang segera kedaluwarsa", () => {
    const result = buildSerialBatchStock({
      records: [
        record({ kind: "batch", code: "LEWAT", status: null, expiryDate: new Date(2026, 8, 1) }),
        record({ kind: "batch", code: "SEGERA", status: null, expiryDate: new Date(2026, 9, 25) }),
        record({ kind: "batch", code: "AMAN", status: null, expiryDate: new Date(2027, 5, 1) }),
        record({ kind: "batch", code: "TANPA", status: null, expiryDate: null }),
      ],
      asOf: AS_OF,
      trackedItems: 1,
    })

    expect(result.totals.expired).toBe(1)
    expect(result.totals.expiringSoon).toBe(1)
    expect(result.totals.noExpiry).toBe(1)
    expect(texts(result)).toContain("lewat")
    expect(texts(result)).toContain("tidak punya tanggal kedaluwarsa")
  })

  it("membedakan 'belum dipakai' dari 'aktif tapi belum ada catatan'", () => {
    const aktif = buildSerialBatchStock({ records: [], asOf: AS_OF, trackedItems: 3 })
    const belum = buildSerialBatchStock({ records: [], asOf: AS_OF, trackedItems: 0 })

    expect(texts(aktif)).toContain("pelacakan nomor seri/batch, tetapi belum ada")
    expect(texts(belum)).toContain("Belum ada barang yang mengaktifkan pelacakan")
    expect(serialBatchSummary(aktif)).toContain("Pelacakan aktif")
    expect(serialBatchSummary(belum)).toContain("Belum ada barang")
  })

  it("menyatakan kuantitas tidak dijumlahkan lintas satuan", () => {
    const result = buildSerialBatchStock({ records: [record()], asOf: AS_OF, trackedItems: 1 })

    expect(texts(result)).toContain("TIDAK dijumlahkan")
  })

  it("meringkas untuk KPI saat ada nomor seri/batch", () => {
    const result = buildSerialBatchStock({
      records: [record(), record({ kind: "batch", code: "B-01", status: null, qty: 5, expiryDate: new Date(2026, 8, 1) })],
      asOf: AS_OF,
      trackedItems: 1,
    })

    expect(serialBatchSummary(result)).toContain("1 nomor seri")
    expect(serialBatchSummary(result)).toContain("1 kedaluwarsa")
  })
})
