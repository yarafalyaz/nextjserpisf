// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { WorkOrderPartStatusCard } from "../work-order-part-status-card"
import { buildWorkOrderPartStatus } from "@/lib/reports/work-order-part-status"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const NAMES = new Map([
  [10, "Kampas Rem"],
  [20, "Oli Mesin"],
])

describe("WorkOrderPartStatusCard F-2026-10-20-105", () => {
  it("render baris, status turunan, ringkasan, dan notice apa adanya", () => {
    const report = buildWorkOrderPartStatus({
      lines: [
        { id: 1, itemId: 10, description: null, qty: 2, storedStatus: "pending" },
        { id: 2, itemId: 20, description: "Ganti oli", qty: 1, storedStatus: "pending" },
        { id: 3, itemId: 0, description: "Jasa servis", qty: 1, storedStatus: "pending" },
      ],
      issues: [{ workOrderItemId: 1, itemId: 10, qty: 2 }],
      orders: [{ itemId: 20, orderedQty: 5, receivedQty: 1 }],
    })
    const { container, root } = renderCard(
      <WorkOrderPartStatusCard report={report} nameByItemId={NAMES} />,
    )
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Status Part Perintah Kerja"]')).not.toBeNull()
    expect(text).toContain("Kampas Rem")
    expect(text).toContain("Ganti oli")
    expect(text).toContain("Terpasang")
    expect(text).toContain("Dipesan")
    expect(text).toContain("Jasa — tak-tertaut")
    expect(text).toContain("Ringkasan Status")
    // notice backend tampil apa adanya, bukan dihitung ulang
    expect(text).toContain("Retur pembelian tidak tertaut per baris perintah kerja")
    unmountCard(root)
  })

  it("keadaan kosong tampil pesan, bukan tabel", () => {
    const report = buildWorkOrderPartStatus({ lines: [], issues: [], orders: [] })
    const { container, root } = renderCard(
      <WorkOrderPartStatusCard report={report} nameByItemId={NAMES} />,
    )
    expect(container.textContent ?? "").toContain("Belum ada baris part")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
