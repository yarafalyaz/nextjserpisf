// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { DeferredTaxValueEventCard } from "../deferred-tax-value-event-card"
import { DEFERRED_TAX_NOTICE } from "@/lib/reports/deferred-tax"
import {
  buildDeferredTaxValueEventSource,
  VALUE_EVENT_SOURCE_UNAVAILABLE_LABEL,
} from "@/lib/reports/deferred-tax-value-events"
import { valueEventFixture as event } from "@/lib/reports/__tests__/deferred-tax-value-event-fixtures"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const AS_OF = new Date(Date.UTC(2026, 11, 31))

describe("DeferredTaxValueEventCard F-2026-10-23-125-V", () => {
  it("sumber belum tersedia: notice belum-terbekukan verbatim, nol angka Rp tampil", () => {
    const report = buildDeferredTaxValueEventSource({ events: [], taxRatePercent: 22, asOf: AS_OF })
    const { container, root } = renderCard(<DeferredTaxValueEventCard report={report} />)
    const text = container.textContent ?? ""
    expect(report.sourceAvailable).toBe(false)
    expect(container.querySelector('[aria-label="Sumber Nilai Pajak Tangguhan (Revaluasi/Impairment)"]')).not.toBeNull()
    expect(text).toContain(VALUE_EVENT_SOURCE_UNAVAILABLE_LABEL)
    expect(text).toContain(DEFERRED_TAX_NOTICE)
    expect(text).toContain(report.verdict)
    // Jangan tampilkan nol sebagai "tidak ada perbedaan" dari sumber ini.
    expect(text).not.toContain("Rp 0")
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("a")).toBeNull()
    unmountCard(root)
  })

  it("berisi: kolom + totals builder verbatim, PPh final terpisah dari indikasi tangguhan", () => {
    const report = buildDeferredTaxValueEventSource({
      events: [event({ finalTaxAmount: 5_000_000 })],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    const { container, root } = renderCard(<DeferredTaxValueEventCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Δ Tercatat")
    expect(text).toContain("Δ Dasar Fiskal Terbekukan")
    expect(text).toContain("Komponen Temporer")
    expect(text).toContain("PPh Final (pajak kini)")
    expect(text).toContain("Revaluasi naik")
    expect(text).toContain("Kena pajak (liabilitas)")
    // Isolasi summary kartu (<p> di header shell): verdict/tabel builder ikut
    // memuat recognitionLabel, jadi toContain pada seluruh teks tidak
    // membuktikan segmen ini dirender summary.
    const summaryText =
      container.querySelector(
        'section[aria-label="Sumber Nilai Pajak Tangguhan (Revaluasi/Impairment)"] div p',
      )?.textContent ?? ""
    expect(summaryText).toContain(`(${report.recognitionLabel})`)
    expect(text).toContain(DEFERRED_TAX_NOTICE)
    expect(text).toContain(report.verdict)
    // Ringkasan: indikasi liabilitas 22% x 50jt = Rp 11.000.000; PPh final
    // Rp 5.000.000 tampil sebagai pajak kini terpisah, tidak di-netting.
    expect(text).toContain("indikasi liabilitas Rp 11.000.000")
    expect(text).toContain("PPh final (pajak kini) Rp 5.000.000")
    expect(text).toContain("bukan komponen pajak tangguhan dan tidak di-netting")
    expect(text).toContain("tarif pasokan operator — bukan master")
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })

  it("tarif tidak sah: verdict fail-closed builder tampil, nol tombol", () => {
    const report = buildDeferredTaxValueEventSource({
      events: [event()],
      taxRatePercent: null,
      asOf: AS_OF,
    })
    const { container, root } = renderCard(<DeferredTaxValueEventCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Sumber revaluasi/impairment tidak dihitung: tarif badan tidak sah")
    expect(text).toContain(DEFERRED_TAX_NOTICE)
    expect(text.split(DEFERRED_TAX_NOTICE).length - 1).toBeGreaterThanOrEqual(2)
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })
})
