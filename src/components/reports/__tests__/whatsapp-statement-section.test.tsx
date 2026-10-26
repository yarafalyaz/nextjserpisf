// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

vi.mock("@/actions/whatsapp-log.actions", () => ({
  recordWhatsappLinkOpened: vi.fn(async () => ({ success: true })),
}))

import { WhatsappStatementSection } from "../whatsapp-statement-section"
import { recordWhatsappLinkOpened } from "@/actions/whatsapp-log.actions"
import { unmountCard, clearRenderedCards } from "./card-test-utils"
import { STATEMENT_PERIOD, STATEMENT_CUSTOMER, STATEMENT_TRAIL, clickFirstLink, expectEmptySurface, expectTrailList, expectNoTrailList, expectPrimaryLink, expectNegativeBalanceHref, STATEMENT_MESSAGE_POSITIVE } from "./statement-section-test-utils"

afterEach(() => {
  clearRenderedCards()
  vi.mocked(recordWhatsappLinkOpened).mockClear()
})

const PERIOD = STATEMENT_PERIOD
const CUSTOMER = STATEMENT_CUSTOMER

function section(overrides: Partial<Parameters<typeof WhatsappStatementSection>[0]> = {}) {
  return (
    <WhatsappStatementSection
      customer={CUSTOMER}
      customerPhone="0812-3456-7890"
      closingBalance={350_000}
      whatsappTrail={[]}
      {...PERIOD}
      {...overrides}
    />
  )
}

const FORBIDDEN = /terkirim|dibaca|sudah dihubungi|tagihan|menunggak|denda/i

describe("WhatsappStatementSection F-2026-10-25-038-F1", () => {
  it("AC-SW-F1/F2: tombol tampil dengan URL wa.me berisi pesan verbatim Q-SW-3 dari payload server", () => {
    expectPrimaryLink(section(), {
      ariaLabel: "Kirim WA",
      href: "https://wa.me/6281234567890?text=" + encodeURIComponent(STATEMENT_MESSAGE_POSITIVE),
      note: "Tautan WhatsApp dibuka tercatat sebagai jejak.",
      forbidden: FORBIDDEN,
      target: "_blank",
    })
  })

  it("AC-SW-F2: saldo negatif dirender sebagai kelebihan bayar absolut, bukan hitung ulang klien", () => {
    expectNegativeBalanceHref(section({ closingBalance: -250_000 }))
  })

  it("klik mencatat tepat 1 jejak berjangkar pelanggan + periode payload, tanpa mencegah navigasi", () => {
    const { root, event } = clickFirstLink(section())
    expect(recordWhatsappLinkOpened).toHaveBeenCalledTimes(1)
    expect(recordWhatsappLinkOpened).toHaveBeenCalledWith({
      modelType: "CustomerStatement",
      modelId: 7,
      surface: "detail",
      periodStart: PERIOD.periodStart,
      periodEnd: PERIOD.periodEnd,
    })
    expect(event.defaultPrevented).toBe(false)
    unmountCard(root)
  })

  it("AC-SW-F1: nomor kosong/tidak valid -> permukaan TIDAK tampil (bukan disable)", () => {
    for (const phone of [null, "", "0812"]) expectEmptySurface(section({ customerPhone: phone }))
  })

  it("AC-SW-F1: pelanggan tidak terpilih -> permukaan tidak tampil", () => {
    expectEmptySurface(section({ customer: null }))
  })

  it("AC-SW-F4: riwayat baca-saja terbaru-dulu, waktu WIB + nama staf apa adanya", () => {
    expectTrailList(section({ whatsappTrail: [...STATEMENT_TRAIL] }), {
      listLabel: "Riwayat tautan WhatsApp dibuka",
      first: "Tautan WhatsApp dibuka — 21 Oktober 2026 pukul 10.00 WIB oleh Sari",
      second: "Tautan WhatsApp dibuka — 20 Oktober 2026 pukul 10.00 WIB oleh Pengguna",
      forbidden: FORBIDDEN,
    })
  })

  it("AC-SW-F4: tanpa jejak -> daftar riwayat tidak tampil, tombol tetap tampil", () => {
    expectNoTrailList(section(), "Riwayat tautan WhatsApp dibuka")
  })
})
