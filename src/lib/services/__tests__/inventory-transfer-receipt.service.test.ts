import { describe, expect, it } from "vitest"
import {
  buildShortageLines,
  deriveTransferStatusAfterReceipt,
  remainingQty,
  remainingSerials,
  validateReceiptLines,
  type TransferLineState,
} from "../inventory-transfer-receipt.service"

const lines: TransferLineState[] = [
  { id: 11, itemId: 1, qty: 10, receivedQty: 4, serialNumbers: [] },
  { id: 12, itemId: 2, qty: 5, receivedQty: 0, serialNumbers: ["SN-1", "SN-2"] },
]

describe("inventory-transfer-receipt.service (F-2026-10-22-081-S)", () => {
  it("sisa = qty - receivedQty, lantai nol (G-5)", () => {
    expect(remainingQty(lines[0])).toBe(6)
    expect(remainingQty({ ...lines[0], receivedQty: 12 })).toBe(0)
    expect(remainingQty(lines[1])).toBe(5)
  })

  it("status turunan: semua penuh -> received, sebagian -> partially_received (BR-TP-07)", () => {
    expect(
      deriveTransferStatusAfterReceipt([
        { ...lines[0], receivedQty: 10 },
        { ...lines[1], receivedQty: 5 },
      ]),
    ).toBe("received")
    expect(deriveTransferStatusAfterReceipt(lines)).toBe("partially_received")
  })

  it("serial sisa = dikirim minus sudah diterima (AC-TP-2 guard)", () => {
    expect(remainingSerials(lines[1], ["SN-1"])).toEqual(["SN-2"])
    expect(remainingSerials(lines[1], [])).toEqual(["SN-1", "SN-2"])
  })

  it("validasi: qty <= 0 ditolak", () => {
    expect(() => validateReceiptLines(lines, [{ transferItemId: 11, qty: 0 }], new Map())).toThrow()
    expect(() => validateReceiptLines(lines, [{ transferItemId: 11, qty: -1 }], new Map())).toThrow()
  })

  it("validasi: qty di atas sisa baris ditolak (over-receive)", () => {
    expect(() =>
      validateReceiptLines(lines, [{ transferItemId: 11, qty: 7 }], new Map()),
    ).toThrow(/melebihi sisa/)
  })

  it("validasi: qty sama dengan sisa dan terima dua baris diterima", () => {
    expect(
      validateReceiptLines(lines, [
        { transferItemId: 11, qty: 6 },
        { transferItemId: 12, qty: 2, serialNumbers: ["SN-1", "SN-2"] },
      ], new Map()),
    ).toHaveLength(2)
  })

  it("validasi: baris tak dikenal / duplikat / kosong ditolak", () => {
    expect(() => validateReceiptLines(lines, [{ transferItemId: 99, qty: 1 }], new Map())).toThrow()
    expect(() =>
      validateReceiptLines(lines, [
        { transferItemId: 11, qty: 1 },
        { transferItemId: 11, qty: 1 },
      ], new Map()),
    ).toThrow()
    expect(() => validateReceiptLines(lines, [], new Map())).toThrow()
  })

  it("validasi serial: serial tak dikenal, sudah diterima, dan jumlah != qty ditolak", () => {
    const received = new Map([[12, ["SN-1"]]])
    expect(() =>
      validateReceiptLines(lines, [{ transferItemId: 12, qty: 1, serialNumbers: ["SN-X"] }], received),
    ).toThrow()
    expect(() =>
      validateReceiptLines(lines, [{ transferItemId: 12, qty: 1, serialNumbers: ["SN-1"] }], received),
    ).toThrow()
    expect(() =>
      validateReceiptLines(lines, [{ transferItemId: 12, qty: 2, serialNumbers: ["SN-2"] }], received),
    ).toThrow()
    expect(() =>
      validateReceiptLines(lines, [{ transferItemId: 12, qty: 1, serialNumbers: ["SN-2"] }], received),
    ).not.toThrow()
  })

  it("validasi batch: total alokasi melebihi qty kejadian ditolak", () => {
    expect(() =>
      validateReceiptLines(lines, [
        { transferItemId: 11, qty: 2, batchAllocations: [{ batchNumber: "LOT-A", qty: 3 }] },
      ], new Map()),
    ).toThrow()
    expect(() =>
      validateReceiptLines(lines, [
        {
          transferItemId: 11,
          qty: 2,
          batchAllocations: [
            { batchNumber: "LOT-A", qty: 1 },
            { batchNumber: "LOT-B", qty: 1 },
          ],
        },
      ], new Map()),
    ).not.toThrow()
  })

  it("regresi TASK-012: terima parsial item berseri tanpa serial ditolak", () => {
    const serialLines: TransferLineState[] = [
      { id: 21, itemId: 7, qty: 3, receivedQty: 0, serialNumbers: ["S1", "S2", "S3"] },
    ]
    expect(() =>
      validateReceiptLines(serialLines, [{ transferItemId: 21, qty: 2 }], new Map()),
    ).toThrow(/berseri.*nomor seri|memerlukan tepat/)
    expect(() =>
      validateReceiptLines(serialLines, [{ transferItemId: 21, qty: 2, serialNumbers: [] }], new Map()),
    ).toThrow(/berseri.*nomor seri|memerlukan tepat/)
    expect(() =>
      validateReceiptLines(serialLines, [{ transferItemId: 21, qty: 2, serialNumbers: ["S1"] }], new Map()),
    ).toThrow(/memerlukan tepat/)
    expect(() =>
      validateReceiptLines(serialLines, [{ transferItemId: 21, qty: 2, serialNumbers: ["S1", "SX"] }], new Map()),
    ).toThrow(/bukan serial terkirim/)
    expect(
      validateReceiptLines(serialLines, [{ transferItemId: 21, qty: 2, serialNumbers: ["S1", "S2"] }], new Map()),
    ).toHaveLength(1)
  })

  it("regresi TASK-012: alokasi batch parsial ditolak, tepat qty diterima, lot asing ditolak", () => {
    const batchLines: TransferLineState[] = [
      {
        id: 31,
        itemId: 8,
        qty: 10,
        receivedQty: 0,
        serialNumbers: [],
        batchAllocations: [
          { batchNumber: "LOT-A", qty: 6 },
          { batchNumber: "LOT-B", qty: 4 },
        ],
      },
    ]
    // 4 dari 10
    expect(() =>
      validateReceiptLines(
        batchLines,
        [{ transferItemId: 31, qty: 10, batchAllocations: [{ batchNumber: "LOT-A", qty: 4 }] }],
        new Map(),
      ),
    ).toThrow(/alokasi batch|menjumlah tepat/)
    // tanpa alokasi sama sekali untuk item batch
    expect(() => validateReceiptLines(batchLines, [{ transferItemId: 31, qty: 10 }], new Map())).toThrow(
      /alokasi nomor batch|alokasi batch/,
    )
    // lot tidak terkirim
    expect(() =>
      validateReceiptLines(
        batchLines,
        [{ transferItemId: 31, qty: 2, batchAllocations: [{ batchNumber: "LOT-X", qty: 2 }] }],
        new Map(),
      ),
    ).toThrow(/bukan lot terkirim/)
    // tepat qty per lot diterima
    expect(
      validateReceiptLines(
        batchLines,
        [
          {
            transferItemId: 31,
            qty: 10,
            batchAllocations: [
              { batchNumber: "LOT-A", qty: 6 },
              { batchNumber: "LOT-B", qty: 4 },
            ],
          },
        ],
        new Map(),
      ),
    ).toHaveLength(1)
    // parsial kejadian 4 dengan lot tepat 4 diterima (kejadian parsial, bukan alokasi parsial)
    expect(
      validateReceiptLines(
        batchLines,
        [{ transferItemId: 31, qty: 4, batchAllocations: [{ batchNumber: "LOT-A", qty: 4 }] }],
        new Map(),
      ),
    ).toHaveLength(1)
  })

  it("regresi TASK-012: sisa lot per kejadian berikutnya dihormati", () => {
    const batchLines: TransferLineState[] = [
      {
        id: 31,
        itemId: 8,
        qty: 10,
        receivedQty: 4,
        serialNumbers: [],
        batchAllocations: [
          { batchNumber: "LOT-A", qty: 6 },
          { batchNumber: "LOT-B", qty: 4 },
        ],
      },
    ]
    const alreadyBatches = new Map([[31, new Map([["LOT-A", 4]])]])
    expect(() =>
      validateReceiptLines(
        batchLines,
        [{ transferItemId: 31, qty: 3, batchAllocations: [{ batchNumber: "LOT-A", qty: 3 }] }],
        new Map(),
        alreadyBatches,
      ),
    ).toThrow(/melebihi sisa lot terkirim/)
    expect(
      validateReceiptLines(
        batchLines,
        [{ transferItemId: 31, qty: 2, batchAllocations: [{ batchNumber: "LOT-A", qty: 2 }] }],
        new Map(),
        alreadyBatches,
      ),
    ).toHaveLength(1)
  })

  it("shortage: hanya baris bersisa, nilai sisa x carried cost, serial sisa ikut", () => {
    const shortage = buildShortageLines(
      lines,
      new Map([[12, ["SN-1"]]]),
      new Map([
        [1, 5000],
        [2, 2500],
      ]),
    )
    expect(shortage).toHaveLength(2)
    expect(shortage[0]).toMatchObject({ transferItemId: 11, remainingQty: 6, unitCost: 5000, value: 30000 })
    expect(shortage[1]).toMatchObject({ transferItemId: 12, remainingQty: 5, unitCost: 2500 })
    expect(shortage[1].serialNumbers).toEqual(["SN-2"])
  })
})
