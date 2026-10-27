// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { InventoryTransferUnreceivedQueueCard } from "../inventory-transfer-unreceived-queue-card"
import {
  buildInventoryTransferUnreceivedQueue,
  type InventoryTransferUnreceivedInput,
} from "@/lib/reports/inventory-transfer-unreceived-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import type { Root } from "react-dom/client"

const NOW = new Date("2026-10-27T05:00:00.000Z")
const dayAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function input(
  over: Partial<InventoryTransferUnreceivedInput> = {},
): InventoryTransferUnreceivedInput {
  return {
    transferId: 1,
    slug: "trf-1",
    documentNo: "TRF/2026/001",
    status: "processed",
    date: dayAgo(5),
    sourceWarehouseId: 10,
    sourceWarehouseName: "Gudang A",
    destinationWarehouseId: 20,
    destinationWarehouseName: "Gudang B",
    lines: [
      { lineId: 11, itemId: 101, qty: 10, receivedQty: 0 },
      { lineId: 12, itemId: 102, qty: 5, receivedQty: 5 },
    ],
    lastReceiptAt: null,
    ...over,
  }
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach(unmountCard)
  roots = []
  clearRenderedCards()
})

describe("InventoryTransferUnreceivedQueueCard (AC-ITQ-F1..F3)", () => {
  it("F1: label ember/tingkat/umur/sisa/rekap verbatim payload; status mentah tertanda", () => {
    const queue = buildInventoryTransferUnreceivedQueue(
      [
        input({}),
        input({
          transferId: 2,
          slug: "trf-2",
          documentNo: "TRF/2026/002",
          status: "partially_received",
          date: dayAgo(1),
          lastReceiptAt: dayAgo(0),
          lines: [{ lineId: 21, itemId: 101, qty: 10, receivedQty: 4 }],
        }),
      ],
      NOW,
    )
    const { container, root } = renderCard(<InventoryTransferUnreceivedQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("Transfer Belum Diterima Penuh")
    expect(text).toContain("Belum Diterima")
    expect(text).toContain("(processed)")
    expect(text).toContain("Diterima Sebagian")
    expect(text).toContain("Umur di Jalan")
    expect(text).toContain("5 hari")
    expect(text).toContain("Mengendap")
    expect(text).toContain("Baris Bersisa 1 dari 2")
    expect(text).toContain("Baris Bersisa k dari n".replace("k", "1").replace("n", "2"))
    expect(text).toContain("Gudang A → Gudang B")
    expect(text).toContain("Terima Terakhir")
  })

  it("F2: tanpa tombol tulis; tautan hanya ke detail transfer existing", () => {
    const queue = buildInventoryTransferUnreceivedQueue([input({})], NOW)
    const { container, root } = renderCard(<InventoryTransferUnreceivedQueueCard queue={queue} />)
    roots.push(root)
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.querySelectorAll("form")).toHaveLength(0)
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toMatch(/^\/inventaris\/transfer\//)
    for (const href of hrefs) {
      expect(href).not.toContain("tambah")
      expect(href).not.toContain("ubah")
    }
  })

  it("F3: tanda tanpa baris bersisa, status tidak dikenal, terpotong tampil apa adanya", () => {
    const many = [
      input({
        transferId: 1,
        lines: [{ lineId: 11, itemId: 101, qty: 3, receivedQty: 3 }],
      }),
      input({ transferId: 2, slug: "trf-2", documentNo: "TRF/2026/002", date: dayAgo(4) }),
      input({ transferId: 3, slug: "trf-3", documentNo: "TRF/2026/003", status: "warisan-asing" }),
    ]
    const queue = buildInventoryTransferUnreceivedQueue(many, NOW, 3, 1)
    const { container, root } = renderCard(<InventoryTransferUnreceivedQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("tanpa baris bersisa")
    expect(text).toContain("Status Tidak Dikenal")
    expect(text).toContain("warisan-asing")
    expect(text).toContain("terpotong")
  })

  it("F2/F3 sumber: komponen tanpa hitung umur/tingkat dan tanpa tombol aksi tulis", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/reports/inventory-transfer-unreceived-queue-card.tsx"),
      "utf8",
    )
    expect(src).not.toMatch(/<button/)
    expect(src).not.toMatch(/wibDayNumber|Date\.now|new Date\(\)/)
    expect(src).not.toMatch(/qty\s*-|receivedQty/)
  })
})
