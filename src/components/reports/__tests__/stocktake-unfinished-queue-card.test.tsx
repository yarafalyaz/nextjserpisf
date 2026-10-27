// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { StocktakeUnfinishedQueueCard } from "../stocktake-unfinished-queue-card"
import {
  buildStocktakeUnfinishedQueue,
  type StocktakeUnfinishedInput,
} from "@/lib/reports/stocktake-unfinished-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import type { Root } from "react-dom/client"

const NOW = new Date("2026-10-27T05:00:00.000Z")
const dayAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function input(over: Partial<StocktakeUnfinishedInput> = {}): StocktakeUnfinishedInput {
  return {
    sessionId: 1, slug: "stk-1", documentNo: "STK/2026/001", status: "draft",
    warehouseId: 10, warehouseCode: "GDG-A", warehouseName: "Gudang A",
    date: dayAgo(1), createdAt: dayAgo(5), snapshotAt: null, approvedAt: null, lines: [],
    ...over,
  }
}

let roots: Root[] = []
afterEach(() => { roots.forEach(unmountCard); roots = []; clearRenderedCards() })

describe("StocktakeUnfinishedQueueCard (AC-STQ-F1..F3)", () => {
  it("F1: label/umur/progres/rekap verbatim payload; status mentah tertanda", () => {
    const queue = buildStocktakeUnfinishedQueue([
      input({ sessionId: 1, status: "draft", createdAt: dayAgo(5) }),
      input({ sessionId: 2, slug: "stk-2", documentNo: "STK/2026/002", status: "counting", snapshotAt: dayAgo(1), createdAt: dayAgo(9), lines: [{ systemQty: 5, count1: 0, count2: null }, { systemQty: 5, count1: null, count2: null }] }),
    ], NOW)
    const { container, root } = renderCard(<StocktakeUnfinishedQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("Sesi Opname Belum Selesai")
    expect(text).toContain("Draft")
    expect(text).toContain("(draft)")
    expect(text).toContain("Sedang Dihitung")
    expect(text).toContain("Umur Tahap")
    expect(text).toContain("5 hari")
    expect(text).toContain("Mengendap")
    expect(text).toContain("Baris Terhitung 1 dari 2")
    expect(text).toContain("Draft: 1")
  })

  it("F2: tanpa tombol transisi; tautan hanya ke detail sesi existing", () => {
    const queue = buildStocktakeUnfinishedQueue([input({})], NOW)
    const { container, root } = renderCard(<StocktakeUnfinishedQueueCard queue={queue} />)
    roots.push(root)
    expect(container.querySelectorAll("button")).toHaveLength(0)
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toMatch(/^\/inventaris\/opname\/sesi\//)
    const text = container.textContent ?? ""
    for (const forbidden of ["Snapshot", "Setujui", "Posting", "Simpan", "Batal"]) {
      // Kata boleh muncul hanya di label tahap "Siap Diposting" (status approved) — populasi draft di sini.
      expect(text).not.toContain(forbidden)
    }
  })

  it("F3: tanda tanpa baris, tanpa penanda tahap, Status Tidak Dikenal, terpotong tampil", () => {
    const queue = buildStocktakeUnfinishedQueue([
      input({ sessionId: 1, status: "draft", createdAt: dayAgo(1) }),
      input({ sessionId: 2, slug: "stk-2", documentNo: "STK/2026/002", status: "counting", snapshotAt: null, createdAt: dayAgo(2), lines: [{ systemQty: 1, count1: 1, count2: null }] }),
      input({ sessionId: 3, slug: "stk-3", documentNo: "STK/2026/003", status: "asing" }),
    ], NOW, 3, 2)
    const { container, root } = renderCard(<StocktakeUnfinishedQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("tanpa baris")
    expect(text).toContain("tanpa penanda tahap")
    expect(text).toContain("terpotong")
    // Status asing ada di populasi penuh (rekap), walau barisnya terpotong dari tampil.
    expect(queue.unknownCount).toBe(1)
    expect(text).toContain("Status Tidak Dikenal: 1")
  })
})
