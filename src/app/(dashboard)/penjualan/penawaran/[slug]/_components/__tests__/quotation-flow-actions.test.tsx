import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

// Aksi server menyeret rantai auth (next-auth -> next/server) yang tak bisa dimuat
// di lingkungan vitest; yang diuji di sini pemetaan status -> tombol, bukan aksinya.
vi.mock("@/actions/sales.actions", () => ({
  sendQuotation: vi.fn(async () => ({ success: true })),
  acceptQuotation: vi.fn(async () => ({ success: true })),
  rejectQuotation: vi.fn(async () => ({ success: true })),
  reviseQuotation: vi.fn(async () => ({ success: true })),
}))

import { QuotationFlowActions } from "../quotation-flow-actions"

/**
 * Tombol alur penawaran harus muncul HANYA pada status yang boleh menjalankan
 * aksinya: `sendQuotation` menolak selain draft, dan `accept`/`rejectQuotation`
 * menolak selain `sent`. Menampilkannya lebih luas berarti menawarkan tombol yang
 * pasti gagal; menyembunyikannya berarti alur pelanggan tak bisa dijalankan lagi.
 */
function render(status: string, perms: { canEdit?: boolean; canConfirm?: boolean } = {}) {
  return renderToStaticMarkup(
    <QuotationFlowActions
      status={status}
      id={1}
      canEdit={perms.canEdit ?? true}
      canConfirm={perms.canConfirm ?? true}
    />,
  )
}

describe("QuotationFlowActions", () => {
  it("menawarkan 'Tandai Terkirim' hanya saat draft", () => {
    expect(render("draft")).toContain("Tandai Terkirim")
    expect(render("sent")).not.toContain("Tandai Terkirim")
  })

  it("menawarkan Terima dan Tolak saat penawaran sudah terkirim", () => {
    const html = render("sent")
    expect(html).toContain("Terima")
    expect(html).toContain("Tolak")
    // Dialog alasan tolak (F-38a) portal tertutup tak dirender static,
    // sama seperti dialog Revisi existing; perilaku terikat handleReject.
  })

  it("tidak menawarkan tombol apa pun pada status yang tak bisa menjalankannya", () => {
    for (const status of ["accepted", "rejected", "converted", "approved", "cancelled"]) {
      const html = render(status)
      expect(html, status).not.toContain("Tandai Terkirim")
      expect(html, status).not.toContain("Terima")
      expect(html, status).not.toContain("Tolak")
    }
  })
})

/**
 * Regresi putaran 223: halaman detail penawaran hanya menuntut view_quotations,
 * sedangkan sendQuotation/reviseQuotation menuntut edit_quotations dan
 * accept/rejectQuotation menuntut confirm_quotations. Sebelum prop izin
 * ditambahkan, peran lihat-saja melihat seluruh bar aksi dan setiap klik
 * berakhir FORBIDDEN dari action.
 */
describe("QuotationFlowActions menghormati izin", () => {
  it("tanpa izin apa pun tidak merender tombol", () => {
    for (const status of ["draft", "sent"]) {
      const html = render(status, { canEdit: false, canConfirm: false })
      expect(html, status).not.toContain("Tandai Terkirim")
      expect(html, status).not.toContain("Terima")
      expect(html, status).not.toContain("Tolak")
    }
  })

  it("confirm_quotations memisahkan Terima/Tolak dari edit_quotations", () => {
    const html = render("sent", { canEdit: false, canConfirm: true })
    expect(html).toContain("Terima")
    expect(html).toContain("Tolak")
    expect(html).not.toContain("Revisi")
  })

  it("edit_quotations memisahkan Revisi dari confirm_quotations", () => {
    const html = render("sent", { canEdit: true, canConfirm: false })
    expect(html).toContain("Revisi")
    expect(html).not.toContain("Terima")
    expect(html).not.toContain("Tolak")
  })

  it("tanpa prop izin default menutup (fail-closed)", () => {
    // Berbeda dari WorkOrderActions yang default permisif untuk kompatibilitas,
    // komponen ini baru dipakai satu tempat: lupa mengoper izin harus
    // menyembunyikan aksi, bukan menampilkannya.
    for (const status of ["draft", "sent"]) {
      expect(
        renderToStaticMarkup(<QuotationFlowActions status={status} id={1} />),
        status,
      ).not.toContain("Tandai Terkirim")
    }
  })
})
