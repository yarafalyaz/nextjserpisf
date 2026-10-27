import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import path from "node:path"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

// Aksi server menyeret rantai auth yang tak bisa dimuat di vitest; yang diuji
// pemetaan fakta MI aktif -> tombol, bukan aksinya.
vi.mock("@/actions/manufacturing.actions", () => ({
  startWorkOrder: vi.fn(async () => ({ success: true })),
  completeWorkOrder: vi.fn(async () => ({ success: true })),
  createMaterialIssueFromWorkOrder: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/actions/inventory.actions", () => ({
  reviseWorkOrderItems: vi.fn(async () => ({ success: true })),
}))

import { WorkOrderActions } from "../work-order-actions"

function render(props: Partial<React.ComponentProps<typeof WorkOrderActions>> = {}) {
  return renderToStaticMarkup(
    <WorkOrderActions
      workOrderId={7}
      status="in_progress"
      hasCompletedMaterialIssue={false}
      defaultWarehouseId={1}
      {...props}
    />,
  )
}

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
