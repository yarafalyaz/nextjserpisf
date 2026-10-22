// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/bom-revision-change.actions", () => ({
  requestBomRevisionChange: vi.fn(async () => ({ success: true, id: 1, status: "menunggu" })),
  decideBomRevisionChange: vi.fn(async () => ({ success: true, id: 1, status: "disetujui" })),
  listBomRevisionChangeRequests: vi.fn(async () => ({ success: true, requests: [] })),
}))

vi.mock("@/actions/bom-revision-change-preview.actions", () => ({
  previewBomRevisionChangeDelta: vi.fn(async () => ({ success: true, delta: null })),
}))

vi.mock("@/lib/utils/toast", () => ({ showError: vi.fn(), showSuccess: vi.fn() }))

import {
  BomRevisionChangePanel,
  type BomRevisionChangeRequestRow,
} from "../bom-revision-change-panel"

afterEach(() => {
  document.body.replaceChildren()
})

function req(status: string, extra: Partial<BomRevisionChangeRequestRow> = {}): BomRevisionChangeRequestRow {
  return {
    id: 3,
    fromRevisionId: 10,
    toRevisionId: 11,
    reason: "Perbaiki komposisi bahan",
    status,
    requestedBy: 7,
    decidedBy: status === "menunggu" ? null : 8,
    decidedAt: status === "menunggu" ? null : new Date("2026-10-22T08:00:00"),
    decisionReason: status === "ditolak" ? "Belum perlu" : null,
    createdAt: new Date("2026-10-22T07:00:00"),
    ...extra,
  }
}

function render(props: Partial<React.ComponentProps<typeof BomRevisionChangePanel>> = {}) {
  return renderToStaticMarkup(
    <BomRevisionChangePanel
      owner={{ workOrderId: 5 }}
      documentStatus="in_progress"
      currentRevision={{ id: 10, revisionNo: 2 }}
      revisionOptions={[{ id: 11, revisionNo: 3 }]}
      requests={[]}
      revisionNoById={{ 10: 2, 11: 3 }}
      userNameById={{ 7: "Andi", 8: "Budi" }}
      itemNameById={{ 100: "Kampas Rem" }}
      canManage
      currentUserId={8}
      {...props}
    />,
  )
}

describe("BomRevisionChangePanel F-2026-10-22-068-S", () => {
  it("tanpa pin revisi: panel senyap (null)", () => {
    expect(render({ currentRevision: null })).toBe("")
  })

  it("kosong: judul + revisi terpasang + tombol ajukan + status kosong", () => {
    const html = render()
    expect(html).toContain("Ganti Revisi BOM")
    expect(html).toContain("Rev. 2")
    expect(html).toContain("+ Ganti Revisi BOM")
    expect(html).toContain("Belum ada pengajuan ganti revisi BOM")
  })

  it("menunggu oleh orang lain: label Menunggu + pengaju + Setujui/Tolak tampil", () => {
    const html = render({ requests: [req("menunggu")] })
    expect(html).toContain("Menunggu")
    expect(html).toContain("Rev. 2 → Rev. 3")
    expect(html).toContain("Perbaiki komposisi bahan")
    expect(html).toContain("Diajukan oleh Andi")
    expect(html).toContain("Setujui")
    expect(html).toContain("Tolak")
    // pengajuan menunggu menekan tombol ajukan baru
    expect(html).not.toContain("+ Ganti Revisi BOM")
    expect(html).toContain("menunggu keputusan")
  })

  it("menunggu oleh diri sendiri: tanpa Setujui/Tolak + catatan pemisahan tugas (SoD)", () => {
    const html = render({ requests: [req("menunggu")], currentUserId: 7 })
    expect(html).not.toContain("Setujui")
    expect(html).not.toContain("Tolak")
    expect(html).toContain("tidak dapat Anda putuskan sendiri")
  })

  it("tanpa izin kelola: tanpa tombol ajukan/putus, daftar tetap terlihat", () => {
    const html = render({ requests: [req("menunggu")], canManage: false })
    expect(html).not.toContain("+ Ganti Revisi BOM")
    expect(html).not.toContain("Setujui")
    expect(html).toContain("Rev. 2 → Rev. 3")
  })

  it("diterapkan_langsung/disetujui/ditolak: label status + putusan, tanpa aksi putus", () => {
    const langsung = render({ requests: [req("diterapkan_langsung")] })
    expect(langsung).toContain("Diterapkan Langsung")
    expect(langsung).not.toContain("Setujui")
    // diterapkan langsung tidak memblokir pengajuan berikut
    expect(langsung).toContain("+ Ganti Revisi BOM")

    const disetujui = render({ requests: [req("disetujui")] })
    expect(disetujui).toContain("Disetujui")
    expect(disetujui).toContain("Diputuskan oleh Budi")
    expect(disetujui).not.toContain("Setujui")

    const ditolak = render({ requests: [req("ditolak")] })
    expect(ditolak).toContain("Ditolak")
    expect(ditolak).toContain("Alasan keputusan: Belum perlu")
    expect(ditolak).not.toContain("Tolak")
  })

  it("dokumen tutup: tanpa tombol ajukan + catatan tutup", () => {
    const html = render({ documentStatus: "completed" })
    expect(html).not.toContain("+ Ganti Revisi BOM")
    expect(html).toContain("sudah ditutup")
  })

  it("tanpa revisi released lain: tanpa tombol + catatan belum ada revisi lain", () => {
    const html = render({ revisionOptions: [] })
    expect(html).not.toContain("+ Ganti Revisi BOM")
    expect(html).toContain("Belum ada revisi BOM released lain")
  })
})
