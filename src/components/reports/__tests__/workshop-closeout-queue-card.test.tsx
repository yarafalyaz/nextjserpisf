// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/manufacturing.actions", () => ({
  closeWorkOrder: vi.fn(async () => ({ success: true })),
  closeProductionOrder: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({ showError: vi.fn(), showSuccess: vi.fn() }))

import { WorkshopCloseoutQueueCard } from "../workshop-closeout-queue-card"
import { closeProductionOrder, closeWorkOrder } from "@/actions/manufacturing.actions"
import {
  buildWorkshopCloseoutQueue,
  type CloseoutQueueJobInput,
} from "@/lib/reports/workshop-closeout-queue"
import { renderCard, unmountCard, clearRenderedCards, setFieldValue } from "./card-test-utils"
import { act } from "react"
import { closeoutJobInput } from "./workshop-closeout-test-fixtures"

const AS_OF = new Date(2026, 9, 24, 0, 0)

function daysAgo(days: number): Date {
  return new Date(AS_OF.getTime() - days * 86_400_000)
}

function jobInput(over: Partial<CloseoutQueueJobInput>): CloseoutQueueJobInput {
  return closeoutJobInput(AS_OF, over)
}

afterEach(() => {
  clearRenderedCards()
  vi.clearAllMocks()
})

describe("WorkshopCloseoutQueueCard F-2026-10-24-097-S S3", () => {
  it("render judul, ringkasan, checklist C1-C8 verbatim, tautan detail, tombol siap-tutup", () => {
    const queue = buildWorkshopCloseoutQueue({ jobs: [jobInput({})], asOf: AS_OF })
    const { container, root } = renderCard(
      <WorkshopCloseoutQueueCard queue={queue} canCloseWorkOrder canCloseProductionOrder={false} />,
    )
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Job Selesai Belum Ditutup"]')).not.toBeNull()
    expect(text).toContain("1 job selesai belum ditutup")
    expect(text).toContain("1 siap tutup")
    expect(text).toContain("WO-0001")
    expect(text).toContain("Budi Santoso")
    expect(text).toContain("Semua perintah produksi anak sudah completed/cancelled/closed.")
    expect(text).toContain("Tidak ada PO pembelian tertaut.")
    expect(text).toContain("Siap tutup")
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(hrefs).toContain("/produksi/perintah-kerja/wo-1")
    const btn = container.querySelector('[aria-label="Tutup Job WO-0001"]')
    expect(btn).not.toBeNull()
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    unmountCard(root)
  })

  it("job tertahan: tombol disabled + blockers verbatim; tanpa izin tombol hilang", () => {
    const queue = buildWorkshopCloseoutQueue({
      jobs: [
        jobInput({
          unpostedCostCount: 1,
          firstUnpostedCostId: 77,
          qcBlocked: null,
          qcDetail: "Belum ada inspeksi final tercatat.",
        }),
      ],
      asOf: AS_OF,
    })
    const { container, root } = renderCard(
      <WorkshopCloseoutQueueCard queue={queue} canCloseWorkOrder canCloseProductionOrder={false} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Belum siap tutup")
    expect(text).toContain("Biaya produksi #77 belum terposting (postedAt kosong).")
    expect(text).toContain("Belum ada inspeksi final tercatat.")
    const btn = container.querySelector(
      '[aria-label="Tutup Job WO-0001"]',
    ) as HTMLButtonElement | null
    expect(btn?.disabled).toBe(true)
    unmountCard(root)

    const denied = renderCard(
      <WorkshopCloseoutQueueCard
        queue={queue}
        canCloseWorkOrder={false}
        canCloseProductionOrder={false}
      />,
    )
    expect(denied.container.querySelector('[aria-label="Tutup Job WO-0001"]')).toBeNull()
    unmountCard(denied.root)
  })

  it("PO: sisa WIP dari builder tampil; tanggal legacy berlabel perkiraan", () => {
    const queue = buildWorkshopCloseoutQueue({
      jobs: [
        jobInput({
          kind: "production_order",
          id: 9,
          slug: "po-9",
          documentNo: "PO-0009",
          endDate: null,
          updatedAt: daysAgo(5),
          qty: 2,
          completedQty: 2,
          totalActualCost: 250_000,
          productName: "Bumper Depan",
          workOrderDocumentNo: "WO-0001",
          workOrderId: 1,
          customerName: null,
          plateNumber: null,
          vehicleLabel: null,
        }),
      ],
      asOf: AS_OF,
    })
    // PO bersisa WIP ditahan C4 oleh builder; kartu menampilkannya apa adanya.
    const { container, root } = renderCard(
      <WorkshopCloseoutQueueCard queue={queue} canCloseWorkOrder={false} canCloseProductionOrder />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Sisa WIP totalActualCost Rp250000.00 belum nol.")
    expect(text).toContain("tanggal perkiraan")
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(hrefs).toContain("/produksi/production-orders/po-9")
    unmountCard(root)
  })

  it("kosong tampil pesan builder, bukan tabel/baris", () => {
    const queue = buildWorkshopCloseoutQueue({ jobs: [], asOf: AS_OF })
    const { container, root } = renderCard(
      <WorkshopCloseoutQueueCard queue={queue} canCloseWorkOrder canCloseProductionOrder />,
    )
    expect(container.textContent ?? "").toContain(
      "Tidak ada job selesai yang belum ditutup saat ini.",
    )
    unmountCard(root)
  })

  it("klik Tutup Job buka dialog alasan; konfirmasi panggil aksi server", async () => {
    const queue = buildWorkshopCloseoutQueue({ jobs: [jobInput({})], asOf: AS_OF })
    const { container, root } = renderCard(
      <WorkshopCloseoutQueueCard queue={queue} canCloseWorkOrder canCloseProductionOrder={false} />,
    )
    const btn = container.querySelector(
      '[aria-label="Tutup Job WO-0001"]',
    ) as HTMLButtonElement
    btn.click()
    // Dialog (portal radix) dirender ke document.body.
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Alasan Penutupan")
    })
    expect(closeWorkOrder).not.toHaveBeenCalled()
    expect(closeProductionOrder).not.toHaveBeenCalled()
    unmountCard(root)
  })

  it("konfirmasi WO: closeWorkOrder 1x (id, alasan trim), closeProductionOrder 0x", async () => {
    const queue = buildWorkshopCloseoutQueue({ jobs: [jobInput({})], asOf: AS_OF })
    const { container, root } = renderCard(
      <WorkshopCloseoutQueueCard queue={queue} canCloseWorkOrder canCloseProductionOrder={false} />,
    )
    act(() => {
      ;(container.querySelector('[aria-label="Tutup Job WO-0001"]') as HTMLButtonElement).click()
    })
    await vi.waitFor(() => {
      expect(document.body.querySelector("#closeout-reason")).not.toBeNull()
    })
    act(() => {
      setFieldValue(document.body, "#closeout-reason", "  Rekonsiliasi bersih  ")
    })
    const confirm = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Ya, Tutup Job",
    )
    expect(confirm).toBeDefined()
    act(() => {
      confirm!.click()
    })
    await vi.waitFor(() => {
      expect(closeWorkOrder).toHaveBeenCalledTimes(1)
    })
    expect(closeWorkOrder).toHaveBeenCalledWith(1, "Rekonsiliasi bersih")
    expect(closeProductionOrder).not.toHaveBeenCalled()
    unmountCard(root)
  })

  it("konfirmasi PO: closeProductionOrder 1x (id, alasan trim), closeWorkOrder 0x", async () => {
    const queue = buildWorkshopCloseoutQueue({
      jobs: [
        jobInput({
          kind: "production_order",
          id: 9,
          slug: "po-9",
          documentNo: "PO-0009",
          qty: 2,
          completedQty: 2,
          totalActualCost: 0,
          productName: "Bumper Depan",
          workOrderDocumentNo: "WO-0001",
          workOrderId: 1,
          customerName: null,
          plateNumber: null,
          vehicleLabel: null,
        }),
      ],
      asOf: AS_OF,
    })
    expect(queue.jobs[0].readyToClose).toBe(true)
    const { container, root } = renderCard(
      <WorkshopCloseoutQueueCard queue={queue} canCloseWorkOrder={false} canCloseProductionOrder />,
    )
    act(() => {
      ;(container.querySelector('[aria-label="Tutup Job PO-0009"]') as HTMLButtonElement).click()
    })
    await vi.waitFor(() => {
      expect(document.body.querySelector("#closeout-reason")).not.toBeNull()
    })
    act(() => {
      setFieldValue(document.body, "#closeout-reason", "  WIP nol, QC lolos  ")
    })
    const confirm = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Ya, Tutup Job",
    )
    expect(confirm).toBeDefined()
    act(() => {
      confirm!.click()
    })
    await vi.waitFor(() => {
      expect(closeProductionOrder).toHaveBeenCalledTimes(1)
    })
    expect(closeProductionOrder).toHaveBeenCalledWith(9, "WIP nol, QC lolos")
    expect(closeWorkOrder).not.toHaveBeenCalled()
    unmountCard(root)
  })
})
