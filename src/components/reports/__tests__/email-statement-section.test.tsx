// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

vi.mock("@/actions/email-log.actions", () => ({
  recordEmailLinkOpened: vi.fn(async () => ({ success: true })),
}))

import { EmailStatementSection } from "../email-statement-section"
import { recordEmailLinkOpened } from "@/actions/email-log.actions"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { STATEMENT_PERIOD, STATEMENT_CUSTOMER, STATEMENT_TRAIL } from "./statement-section-test-utils"

afterEach(() => {
  clearRenderedCards()
  vi.mocked(recordEmailLinkOpened).mockClear()
})

const PERIOD = STATEMENT_PERIOD
const CUSTOMER = STATEMENT_CUSTOMER

function section(overrides: Partial<Parameters<typeof EmailStatementSection>[0]> = {}) {
  return (
    <EmailStatementSection
      customer={CUSTOMER}
      customerEmail="uji@example.com"
      closingBalance={350_000}
      emailTrail={[]}
      {...PERIOD}
      {...overrides}
    />
  )
}

const FORBIDDEN = /terkirim|dibaca|sudah dihubungi/i

describe("EmailStatementSection F-2026-10-25-043-F1", () => {
  it("AC-SE-F2/F3: tombol tampil dengan URL mailto subjek + isi verbatim Q-SE-4 dari payload server", () => {
    const { container, root } = renderCard(section())
    const link = container.querySelector("a")
    expect(link).not.toBeNull()
    expect(link?.getAttribute("aria-label")).toBe("Kirim Email")
    expect(link?.textContent).toContain("Kirim Email")
    expect(link?.getAttribute("href")).toBe(
      "mailto:uji@example.com?subject=" +
        encodeURIComponent("Statement Piutang — Periode 1 Jan 2026 – 15 Okt 2026") +
        "&body=" +
        encodeURIComponent(
          "Halo CV Uji,\n\nBerikut statement piutang Anda untuk Periode 1 Jan 2026 – 15 Okt 2026. " +
            "Saldo akhir periode: Rp 350.000. Statement lengkap dapat kami sediakan/dicetak bila diperlukan.\n\nTerima kasih.",
        ),
    )
    expect(container.textContent).toContain("Tautan Email dibuka tercatat sebagai jejak.")
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN)
    unmountCard(root)
  })

  it("saldo negatif dirender sebagai kelebihan bayar absolut, bukan hitung ulang klien", () => {
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
    expect(recordEmailLinkOpened).toHaveBeenCalledTimes(1)
    expect(recordEmailLinkOpened).toHaveBeenCalledWith({
      modelType: "CustomerStatement",
      modelId: 7,
      surface: "detail",
      periodStart: PERIOD.periodStart,
      periodEnd: PERIOD.periodEnd,
    })
    expect(event.defaultPrevented).toBe(false)
    unmountCard(root)
  })

  it("AC-SE-F1: email kosong/tidak valid -> permukaan TIDAK tampil (bukan disable)", () => {
    for (const email of [null, "", "bukan-email", "uji@example"]) {
      const { container, root } = renderCard(section({ customerEmail: email }))
      expect(container.querySelector("a")).toBeNull()
      expect(container.textContent).toBe("")
      unmountCard(root)
    }
  })

  it("AC-SE-F1: pelanggan tidak terpilih -> permukaan tidak tampil", () => {
    const { container, root } = renderCard(section({ customer: null }))
    expect(container.textContent).toBe("")
    unmountCard(root)
  })

  it("AC-SE-F4: riwayat baca-saja terbaru-dulu, waktu WIB + nama staf apa adanya, terpisah dari WA", () => {
    const trail = [...STATEMENT_TRAIL]
    const { container, root } = renderCard(section({ emailTrail: trail }))
    const list = container.querySelector('[aria-label="Riwayat tautan Email dibuka"]')
    expect(list).not.toBeNull()
    expect(container.querySelector('[aria-label="Riwayat tautan WhatsApp dibuka"]')).toBeNull()
    const items = [...(list?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "")
    expect(items).toHaveLength(2)
    expect(items[0]).toContain("Tautan Email dibuka — 21 Oktober 2026 pukul 10.00 WIB oleh Sari")
    expect(items[1]).toContain("Tautan Email dibuka — 20 Oktober 2026 pukul 10.00 WIB oleh Pengguna")
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN)
    unmountCard(root)
  })

  it("AC-SE-F4: tanpa jejak -> daftar riwayat tidak tampil, tombol tetap tampil", () => {
    const { container, root } = renderCard(section())
    expect(container.querySelector('[aria-label="Riwayat tautan Email dibuka"]')).toBeNull()
    expect(container.querySelector("a")).not.toBeNull()
    unmountCard(root)
  })
})
