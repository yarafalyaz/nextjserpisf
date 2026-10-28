import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

vi.mock("next/navigation", async () => (await import("./work-order-actions-test-utils")).workOrderActionsRouterModule)
vi.mock("@/actions/manufacturing.actions", async () => (await import("./work-order-actions-test-utils")).workOrderActionsManufacturingModule)
vi.mock("@/actions/inventory.actions", async () => (await import("./work-order-actions-test-utils")).workOrderActionsInventoryModule)

import { WorkOrderActions } from "../work-order-actions"
import { renderWorkOrderActions } from "./work-order-actions-test-utils"

const render = (props: Parameters<typeof renderWorkOrderActions>[1] = {}) =>
  renderWorkOrderActions(WorkOrderActions, props, { status: "in_progress" })

describe("WorkOrderActions anti issue ganda WO-BR-004", () => {
  it("belum ada pengeluaran: tombol Buat Pengeluaran Material tampil", () => {
    const html = render()
    expect(html).toContain("Buat Pengeluaran Material")
    expect(html).toContain("Selesaikan")
    // Selesaikan tetap nonaktif sampai ada MI selesai (gerbang existing).
    expect(html).toContain('disabled=""')
  })

  it("pengeluaran aktif (draf/diproses): tombol buat baru hilang, Selesaikan tetap tampil", () => {
    const html = render({ hasActiveMaterialIssue: true })
    expect(html).not.toContain("Buat Pengeluaran Material")
    expect(html).toContain("Selesaikan")
  })

  it("pengeluaran selesai: tombol buat baru hilang dan Selesaikan tampil", () => {
    const html = render({ hasCompletedMaterialIssue: true })
    expect(html).not.toContain("Buat Pengeluaran Material")
    expect(html).toContain("Selesaikan")
  })
})

const pageSrc = readFileSync(
  path.join(process.cwd(), "src/app/(dashboard)/produksi/perintah-kerja/[slug]/page.tsx"),
  "utf8",
)

describe("detail WO: fakta anti issue ganda WO-BR-004", () => {
  it("fakta MI aktif diturunkan dari daftar pengeluaran yang sudah dimuat", () => {
    expect(pageSrc).toContain('mi.status === "draft" || mi.status === "processing"')
    expect(pageSrc).toContain("hasActiveMaterialIssue={!!activeMi}")
  })

  it("tautan buat dari kartu Pengeluaran Material ikut digerbang fakta aktif", () => {
    expect(pageSrc).toContain('wo.status === "in_progress" && !completedMi && !activeMi')
  })

  it("status aktif tampil sebagai petunjuk, bukan tombol yang pasti ditolak", () => {
    expect(pageSrc).toContain('id="wo-material-issue-active-hint"')
    expect(pageSrc).toContain("selesaikan atau batalkan dahulu")
    expect(pageSrc).toContain("{statusLabel(activeMi.status)}")
  })
})
