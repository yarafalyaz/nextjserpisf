// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { WipAgingCard } from "../wip-aging-card"
import { buildWipAging } from "@/lib/reports/wip-aging"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const AS_OF = new Date("2026-10-20T00:00:00Z")

function daysAgo(days: number): Date {
  return new Date(AS_OF.getTime() - days * 86_400_000)
}

describe("WipAgingCard F-2026-10-20-72", () => {
  it("render total, baris order berjalan, tautan detail, ringkasan ember", () => {
    const aging = buildWipAging({
      asOf: AS_OF,
      orders: [
        {
          id: 1,
          slug: "po-0001",
          documentNo: "PO-0001",
          status: "in_progress",
          startDate: daysAgo(40),
          createdAt: daysAgo(40),
          qty: 10,
          completedQty: 4,
          totalActualCost: 1_000_000,
          releasedCost: 400_000,
          productName: "Bumper Depan",
          workOrderDocumentNo: "WO-0001",
        },
        {
          id: 2,
          slug: null,
          documentNo: "PO-0002",
          status: "completed",
          startDate: daysAgo(10),
          createdAt: daysAgo(10),
          qty: 5,
          completedQty: 5,
          totalActualCost: 9_000_000,
          releasedCost: 0,
          productName: "Bumper Belakang",
          workOrderDocumentNo: null,
        },
      ],
    })
    const { container, root } = renderCard(<WipAgingCard aging={aging} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Umur WIP Berjalan"]')).not.toBeNull()
    expect(text).toContain("1 order produksi berjalan")
    expect(text).toContain("Rp 600.000")
    expect(text).toContain("PO-0001")
    expect(text).not.toContain("PO-0002")
    expect(text).toContain("31-60 hari")
    expect(text).toContain("40,00%")
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(links).toContain("/produksi/production-orders/po-0001")
    unmountCard(root)
  })

  it("keadaan kosong tampil pesan, bukan tabel", () => {
    const aging = buildWipAging({ asOf: AS_OF, orders: [] })
    const { container, root } = renderCard(<WipAgingCard aging={aging} />)
    expect(container.textContent ?? "").toContain("Belum ada order produksi berjalan")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
