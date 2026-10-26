// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

vi.mock("@/actions/whatsapp-log.actions", () => ({
  recordWhatsappLinkOpened: vi.fn(async () => ({ success: true })),
}))

import { WhatsappStatementSection } from "../whatsapp-statement-section"
import { recordWhatsappLinkOpened } from "@/actions/whatsapp-log.actions"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { STATEMENT_PERIOD, STATEMENT_CUSTOMER, STATEMENT_TRAIL } from "./statement-section-test-utils"

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
    const { container, root } = renderCard(section())
    const link = container.querySelector("a")
    expect(link).not.toBeNull()
    expect(link?.getAttribute("aria-label")).toBe("Kirim WA")
    expect(link?.textContent).toContain("Kirim WA")
    expect(link?.getAttribute("target")).toBe("_blank")
    expect(link?.getAttribute("href")).toBe(
      "https://wa.me/6281234567890?text=" +
        encodeURIComponent(
          "Halo CV Uji,\n\nBerikut statement piutang Anda untuk Periode 1 Jan 2026 – 15 Okt 2026. " +
            "Saldo akhir periode: Rp 350.000. Statement lengkap dapat kami sediakan/dicetak bila diperlukan.\n\nTerima kasih.",
        ),
    )
    expect(container.textContent).toContain("Tautan WhatsApp dibuka tercatat sebagai jejak.")
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN)
    unmountCard(root)
  })

  it("AC-SW-F2: saldo negatif dirender sebagai kelebihan bayar absolut, bukan hitung ulang klien", () => {
    const { container, root } = renderCard(section({ closingBalance: -250_000 }))
    const href = container.querySelector("a")?.getAttribute("href") ?? ""
    expect(decodeURIComponent(href)).toContain(
      "Saldo akhir periode menunjukkan kelebihan bayar sebesar Rp 250.000 yang tercatat sebagai kredit Anda.",
    )
    expect(decodeURIComponent(href)).not.toContain("-Rp")
    unmountCard(root)
  })

  it("klik mencatat tepat 1 jejak berjangkar pelanggan + periode payload, tanpa mencegah navigasi", () => {
    const { container, root } = renderCard(section())
    const link = container.querySelector("a")
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link?.dispatchEvent(event)
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
    for (const phone of [null, "", "0812"]) {
      const { container, root } = renderCard(section({ customerPhone: phone }))
      expect(container.querySelector("a")).toBeNull()
      expect(container.textContent).toBe("")
      unmountCard(root)
    }
  })

  it("AC-SW-F1: pelanggan tidak terpilih -> permukaan tidak tampil", () => {
    const { container, root } = renderCard(section({ customer: null }))
    expect(container.textContent).toBe("")
    unmountCard(root)
  })

  it("AC-SW-F4: riwayat baca-saja terbaru-dulu, waktu WIB + nama staf apa adanya", () => {
    const trail = [...STATEMENT_TRAIL]
    const { container, root } = renderCard(section({ whatsappTrail: trail }))
    const list = container.querySelector('[aria-label="Riwayat tautan WhatsApp dibuka"]')
    expect(list).not.toBeNull()
    const items = [...(list?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "")
    expect(items).toHaveLength(2)
    expect(items[0]).toContain("Tautan WhatsApp dibuka — 21 Oktober 2026 pukul 10.00 WIB oleh Sari")
    expect(items[1]).toContain("Tautan WhatsApp dibuka — 20 Oktober 2026 pukul 10.00 WIB oleh Pengguna")
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN)
    unmountCard(root)
  })

  it("AC-SW-F4: tanpa jejak -> daftar riwayat tidak tampil, tombol tetap tampil", () => {
    const { container, root } = renderCard(section())
    expect(container.querySelector('[aria-label="Riwayat tautan WhatsApp dibuka"]')).toBeNull()
    expect(container.querySelector("a")).not.toBeNull()
    unmountCard(root)
  })
})
