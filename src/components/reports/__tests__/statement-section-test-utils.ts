// @vitest-environment jsdom
/** Fixture bersama tes seksi pengiriman statement (WA/Email) — cegah duplikasi Sonar. */
export const STATEMENT_PERIOD = {
  periodStart: new Date("2026-01-01T00:00:00.000Z"),
  periodEnd: new Date("2026-10-15T00:00:00.000Z"),
  periodLabel: "Periode 1 Jan 2026 – 15 Okt 2026",
}
export const STATEMENT_CUSTOMER = { id: 7, name: "CV Uji" }
export const STATEMENT_TRAIL = [
  { userName: "Sari", createdAt: new Date("2026-10-21T03:00:00.000Z") },
  { userName: null, createdAt: new Date("2026-10-20T03:00:00.000Z") },
]

import { expect } from "vitest"
import { renderCard, unmountCard } from "./card-test-utils"
import type { ReactNode } from "react"

/** Klik tautan pertama; kembalikan event untuk asersi navigasi tidak dicegah. */
export function clickFirstLink(node: ReactNode) {
  const { container, root } = renderCard(node)
  const event = new MouseEvent("click", { bubbles: true, cancelable: true })
  container.querySelector("a")?.dispatchEvent(event)
  return { container, root, event }
}

/** Asersi permukaan kosong total (AC tidak-tampil, bukan disable). */
export function expectEmptySurface(node: ReactNode) {
  const { container, root } = renderCard(node)
  expect(container.querySelector("a")).toBeNull()
  expect(container.textContent).toBe("")
  unmountCard(root)
}

/** Asersi daftar riwayat: label, jumlah, baris verbatim, tanpa kata terlarang. */
export function expectTrailList(
  node: ReactNode,
  opts: { listLabel: string; absentLabel?: string; first: string; second: string; forbidden: RegExp },
) {
  const { container, root } = renderCard(node)
  const list = container.querySelector(`[aria-label="${opts.listLabel}"]`)
  expect(list).not.toBeNull()
  if (opts.absentLabel) {
    expect(container.querySelector(`[aria-label="${opts.absentLabel}"]`)).toBeNull()
  }
  const items = [...(list?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "")
  expect(items).toHaveLength(2)
  expect(items[0]).toContain(opts.first)
  expect(items[1]).toContain(opts.second)
  expect(container.textContent ?? "").not.toMatch(opts.forbidden)
  unmountCard(root)
}

/** Asersi tanpa daftar riwayat tapi tautan tetap tampil. */
export function expectNoTrailList(node: ReactNode, listLabel: string) {
  const { container, root } = renderCard(node)
  expect(container.querySelector(`[aria-label="${listLabel}"]`)).toBeNull()
  expect(container.querySelector("a")).not.toBeNull()
  unmountCard(root)
}

/** Pesan statement verbatim bersama (Q-SW-3/Q-SE-4, saldo positif fixture). */
export const STATEMENT_MESSAGE_POSITIVE =
  "Halo CV Uji,\n\nBerikut statement piutang Anda untuk Periode 1 Jan 2026 – 15 Okt 2026. " +
  "Saldo akhir periode: Rp 350.000. Statement lengkap dapat kami sediakan/dicetak bila diperlukan.\n\nTerima kasih."
export const STATEMENT_NEGATIVE_SENTENCE =
  "Saldo akhir periode menunjukkan kelebihan bayar sebesar Rp 250.000 yang tercatat sebagai kredit Anda."

/** Asersi tautan utama: label, href persis, catatan jejak, tanpa kata terlarang. */
export function expectPrimaryLink(
  node: ReactNode,
  opts: { ariaLabel: string; href: string; note: string; forbidden: RegExp; target?: string },
) {
  const { container, root } = renderCard(node)
  const link = container.querySelector("a")
  expect(link).not.toBeNull()
  expect(link?.getAttribute("aria-label")).toBe(opts.ariaLabel)
  expect(link?.textContent).toContain(opts.ariaLabel)
  if (opts.target) expect(link?.getAttribute("target")).toBe(opts.target)
  expect(link?.getAttribute("href")).toBe(opts.href)
  expect(container.textContent).toContain(opts.note)
  expect(container.textContent ?? "").not.toMatch(opts.forbidden)
  unmountCard(root)
}

/** Asersi saldo negatif: kalimat kelebihan bayar absolut di href ter-decode. */
export function expectNegativeBalanceHref(node: ReactNode) {
  const { container, root } = renderCard(node)
  const href = container.querySelector("a")?.getAttribute("href") ?? ""
  expect(decodeURIComponent(href)).toContain(STATEMENT_NEGATIVE_SENTENCE)
  expect(decodeURIComponent(href)).not.toContain("-Rp")
  unmountCard(root)
}


/** Render tautan pertama + asersi label/href/note verbatim per kanal. */
export function expectFirstLink(
  node: ReactNode,
  opts: { label: string; href: string; note: string; forbidden: RegExp; targetBlank?: boolean },
) {
  const { container, root } = renderCard(node)
  const link = container.querySelector("a")
  expect(link).not.toBeNull()
  expect(link?.getAttribute("aria-label")).toBe(opts.label)
  expect(link?.textContent).toContain(opts.label)
  if (opts.targetBlank) expect(link?.getAttribute("target")).toBe("_blank")
  expect(link?.getAttribute("href")).toBe(opts.href)
  expect(container.textContent).toContain(opts.note)
  expect(container.textContent ?? "").not.toMatch(opts.forbidden)
  unmountCard(root)
}

/** Asersi saldo negatif: kalimat verbatim absolut, tanpa minus. */
export function expectNegativeBalance(node: ReactNode) {
  const { container, root } = renderCard(node)
  const href = container.querySelector("a")?.getAttribute("href") ?? ""
  expect(decodeURIComponent(href)).toContain(STATEMENT_NEGATIVE_SENTENCE)
  expect(decodeURIComponent(href)).not.toContain("-Rp")
  unmountCard(root)
}
