// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

vi.mock("@/actions/whatsapp-log.actions", () => ({
  recordWhatsappLinkOpened: vi.fn(async () => ({ success: true })),
}));

import { WorkOrderQueueCard } from "../work-order-queue-card"
import { buildWorkOrderQueue, type WorkOrderQueueInput } from "@/lib/reports/work-order-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

const NOW = new Date(2026, 9, 20, 10, 0)

function input(over: Partial<WorkOrderQueueInput>): WorkOrderQueueInput {
  return {
    id: 1,
    slug: "wo-1",
    documentNo: "WO-0001",
    status: "in_progress",
    date: new Date(2026, 9, 10),
    startDate: new Date(2026, 9, 10),
    endDate: null,
    customerName: "Budi Santoso",
    customerPhone: "0812-3456-7890",
    vehicleLabel: "B 1234 AA · Mitsubishi Pajero",
    plateNumber: "B 1234 AA",
    ...over,
  }
}

afterEach(() => {
  clearRenderedCards()
})

describe("WorkOrderQueueCard F-2026-10-20-28(a)", () => {
  it("render urut tenggat + bendera terlambat + tautan detail", () => {
    const queue = buildWorkOrderQueue(
      [
        input({ id: 2, slug: "wo-2", documentNo: "WO-0002", endDate: new Date(2026, 9, 25) }),
        input({ id: 1, slug: "wo-1", documentNo: "WO-0001", endDate: new Date(2026, 9, 18) }),
      ],
      NOW,
    )
    const { container, root } = renderCard(<WorkOrderQueueCard queue={queue} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Antrian Bengkel"]')).not.toBeNull()
    expect(text).toContain("2 perintah kerja aktif")
    expect(text).toContain("1 terlambat")
    expect(text).toContain("Terlambat 2 hari")
    expect(text).toContain("Budi")
    expect(text).toContain("B 1234 AA · Mitsubishi Pajero")
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href")).filter((h) => h?.startsWith("/produksi/"))
    // urutan tenggat: WO-0001 (18 Okt, terlambat) dulu, lalu WO-0002
    expect(links).toEqual(["/produksi/perintah-kerja/wo-1", "/produksi/perintah-kerja/wo-2"])
    unmountCard(root)
  })

  it("tombol WA per baris berisi nomor WO/status/plat; tanpa nomor tampil — (F-92)", () => {
    const queue = buildWorkOrderQueue(
      [
        input({ id: 1, slug: "wo-1", documentNo: "WO-0001", customerName: "Budi Santoso", customerPhone: "0812-3456-7890", plateNumber: "B 1234 AA", endDate: new Date(2026, 9, 25) }),
        input({ id: 2, slug: "wo-2", documentNo: "WO-0002", customerName: "Sari", customerPhone: null, plateNumber: null, vehicleLabel: null }),
      ],
      NOW,
    )
    const { container, root } = renderCard(<WorkOrderQueueCard queue={queue} />)
    const links = Array.from(container.querySelectorAll("a"))
    const wa = links.find((a) => (a.textContent ?? "").includes("Kirim WA"))
    expect(wa?.getAttribute("aria-label")).toBe("Kirim WA")
    const href = wa?.getAttribute("href") ?? ""
    expect(href.startsWith("https://wa.me/6281234567890?text=")).toBe(true)
    const text = decodeURIComponent(href.split("text=")[1] ?? "")
    expect(text).toContain("Perintah Kerja WO-0001")
    expect(text).toContain("B 1234 AA")
    expect(text).toContain("Budi Santoso")
    expect(container.textContent).toContain("—")
    unmountCard(root)
  })

  it("kosong tampil pesan belum ada antrian aktif", () => {
    const queue = buildWorkOrderQueue([], NOW)
    const { container, root } = renderCard(<WorkOrderQueueCard queue={queue} />)
    expect(container.textContent).toContain("Belum ada perintah kerja aktif dalam antrian")
    expect(container.textContent).toContain("0 perintah kerja aktif")
    unmountCard(root)
  })
})
