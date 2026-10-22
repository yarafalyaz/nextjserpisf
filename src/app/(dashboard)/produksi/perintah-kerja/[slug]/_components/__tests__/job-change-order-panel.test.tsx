// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/actions/job-change-order.actions", () => ({
  createJobChangeOrder: vi.fn(async () => ({ success: true })),
  updateJobChangeOrderLines: vi.fn(async () => ({ success: true })),
  sendJobChangeOrder: vi.fn(async () => ({ success: true })),
  recordJobChangeOrderApproval: vi.fn(async () => ({ success: true })),
  cancelJobChangeOrder: vi.fn(async () => ({ success: true })),
  applyJobChangeOrder: vi.fn(async () => ({ success: true, invoiceId: null, creditId: null, note: "ok" })),
}))

import { JobChangeOrderPanel, type ChangeOrderRow } from "../job-change-order-panel"

afterEach(() => {
  document.body.replaceChildren()
})

function co(status: string, extra: Partial<ChangeOrderRow> = {}): ChangeOrderRow {
  return {
    id: 1,
    documentNo: "WO-001-CO-001",
    status,
    reason: "Tambah pekerjaan",
    selisihNilai: status === "draft" ? null : 1500000,
    grandTotalSebelum: status === "draft" ? null : 10000000,
    grandTotalSesudah: status === "draft" ? null : 11500000,
    approvalReference: null,
    appliedNote: status === "diterapkan" ? "Faktur selisih draft #9 dibuat lewat jalur existing." : null,
    appliedInvoiceId: status === "diterapkan" ? 9 : null,
    appliedCreditId: null,
    items: [
      {
        id: 11,
        workOrderItemId: 5,
        itemId: 10,
        action: "ubah",
        description: null,
        qtyBefore: 1,
        qtyAfter: 2,
        costBefore: 500000,
        costAfter: 500000,
        unitPriceBefore: 750000,
        unitPriceAfter: 750000,
      },
    ],
    ...extra,
  }
}

function render(props: Partial<React.ComponentProps<typeof JobChangeOrderPanel>> = {}) {
  return renderToStaticMarkup(
    <JobChangeOrderPanel
      workOrderId={7}
      workOrderStatus="in_progress"
      hasQuotation
      contractGrandTotal={10000000}
      changeOrders={[]}
      workOrderItems={[{ workOrderItemId: 5, itemId: 10, label: "Kampas Rem", qty: 1, cost: 500000 }]}
      inventoryItems={[{ id: 20, label: "Oli Mesin", price: 120000 }]}
      itemNameById={{ 10: "Kampas Rem" }}
      canCreate
      canEdit
      canApply
      {...props}
    />,
  )
}

describe("JobChangeOrderPanel F-2026-10-22-066-S", () => {
  it("status kosong + tombol buat tampil bila eligible & tanpa CO aktif", () => {
    const html = render()
    expect(html).toContain("Change Order")
    expect(html).toContain("Belum ada change order")
    expect(html).toContain("+ Change Order")
    // nilai kontrak tunggal dari penawaran (BR-CO-01)
    expect(html).toContain("Nilai kontrak (penawaran)")
  })

  it("WO tanpa penawaran: tanpa tombol buat + catatan BR-CO-10", () => {
    const html = render({ hasQuotation: false, contractGrandTotal: null })
    expect(html).not.toContain("+ Change Order")
    expect(html).toContain("tanpa penawaran tertaut tidak dapat dibuatkan change order")
  })

  it("draft: Ubah Baris + Kirim + Batalkan; tanpa Catat/Terapkan", () => {
    const html = render({ changeOrders: [co("draft")] })
    expect(html).toContain("Draf")
    expect(html).toContain("Ubah Baris")
    expect(html).toContain("Kirim ke Pelanggan")
    expect(html).toContain("Batalkan")
    expect(html).not.toContain("Catat Persetujuan")
    expect(html).not.toContain("Terapkan Change Order")
    // CO aktif menekan tombol buat baru (BR-CO-06)
    expect(html).not.toContain("+ Change Order")
  })

  it("menunggu_pelanggan: Catat Persetujuan/Penolakan + selisih info; tanpa Kirim/Terapkan", () => {
    const html = render({ changeOrders: [co("menunggu_pelanggan")] })
    expect(html).toContain("Menunggu Pelanggan")
    expect(html).toContain("Catat Persetujuan")
    expect(html).toContain("Catat Penolakan")
    expect(html).toContain("Selisih nilai (info persetujuan)")
    expect(html).not.toContain("Kirim ke Pelanggan")
    expect(html).not.toContain("Terapkan Change Order")
  })

  it("disetujui: Terapkan tampil; ditolak/dibatalkan terminal tanpa aksi", () => {
    expect(render({ changeOrders: [co("disetujui")] })).toContain("Terapkan Change Order")
    for (const status of ["ditolak", "dibatalkan"]) {
      const html = render({ changeOrders: [co(status)] })
      expect(html).not.toContain("Terapkan Change Order")
      expect(html).not.toContain("Catat Persetujuan")
      expect(html).not.toContain("Kirim ke Pelanggan")
    }
  })

  it("diterapkan: note dokumen uang tampil apa adanya", () => {
    const html = render({ changeOrders: [co("diterapkan")] })
    expect(html).toContain("Faktur selisih draft #9 dibuat lewat jalur existing.")
  })

  it("tanpa izin edit/apply: tombol transisi hilang, daftar tetap terbaca", () => {
    const html = render({ changeOrders: [co("disetujui")], canEdit: false, canApply: false, canCreate: false })
    expect(html).toContain("Disetujui")
    expect(html).not.toContain("Terapkan Change Order")
    expect(html).not.toContain("+ Change Order")
  })
})
