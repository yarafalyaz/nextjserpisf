// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { WorkOrderLoadCard } from "../work-order-load-card"
import { buildWorkOrderLoad } from "@/lib/reports/work-order-load"

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("WorkOrderLoadCard F-2026-10-20-02", () => {
  it("render total + baris WO: jam snapshot, nilai beban, tautan detail", () => {
    const load = buildWorkOrderLoad(
      [
        { id: 1, slug: "wo-1", documentNo: "WO-0001", status: "in_progress" },
        { id: 2, slug: "wo-2", documentNo: "WO-0002", status: "draft" },
        { id: 3, slug: "wo-3", documentNo: "WO-0003", status: "completed" },
      ],
      [
        { workOrderId: 1, category: "labor", hours: 4, amount: 200_000 },
        { workOrderId: 1, category: "machine", hours: 2, amount: 150_000 },
        { workOrderId: 3, category: "labor", hours: 9, amount: 900_000 },
      ],
    )
    const { container, root } = render(<WorkOrderLoadCard load={load} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Beban Perintah Kerja"]')).not.toBeNull()
    expect(text).toContain("2 perintah kerja aktif")
    expect(text).toContain("4 jam tenaga kerja")
    expect(text).toContain("2 jam mesin")
    // WO selesai tidak tampil dan biayanya tidak ikut total.
    expect(text).not.toContain("WO-0003")
    expect(text).toContain("WO-0001")
    expect(text).toContain("WO-0002")
    const rowText = Array.from(container.querySelectorAll("tbody tr")).map(
      (tr) => tr.textContent ?? "",
    )
    expect(rowText.some((t) => t.includes("WO-0001") && t.includes("4 jam"))).toBe(true)
    expect(rowText.some((t) => t.includes("WO-0001") && t.includes("2 jam"))).toBe(true)
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(links).toContain("/produksi/perintah-kerja/wo-1")
    act(() => root.unmount())
  })

  it("keadaan kosong tampil pesan, bukan tabel", () => {
    const load = buildWorkOrderLoad([], [])
    const { container, root } = render(<WorkOrderLoadCard load={load} />)
    expect(container.textContent ?? "").toContain("Belum ada perintah kerja aktif")
    expect(container.querySelector("table")).toBeNull()
    act(() => root.unmount())
  })
})
