// Bantu asersi kartu antrean bersama. Blok query+aserti header/aria tampil
// identik antar tes kartu antrean (mis. kinerja vs garansi); Sonar menghitung
// salinannya sebagai duplikasi kode baru, jadi pola simpan sekali di sini.
import { expect } from "vitest"

export function expectQueueCardTable(
  container: HTMLElement,
  ariaLabel: string,
  notice: string,
  headers: string[],
  phrases: string[],
) {
  const text = container.textContent ?? ""
  expect(container.querySelector(`[aria-label="${ariaLabel}"]`)).not.toBeNull()
  expect(text).toContain(notice)
  expect(
    [...container.querySelectorAll("th")].map((el) => el.textContent),
  ).toEqual(headers)
  for (const phrase of phrases) expect(text).toContain(phrase)
  return text
}

export function expectQueueCardTableRows(
  container: HTMLElement,
  expected: {
    bannedPhrases?: string[]
    excludedTexts?: string[]
    firstRowText: string
    secondRowText: string
    dashCells?: Array<{ row: number; child: number }>
    hrefs: string[]
  },
) {
  const text = container.textContent ?? ""
  for (const banned of expected.bannedPhrases ?? []) expect(text).not.toContain(banned)
  for (const excluded of expected.excludedTexts ?? []) expect(text).not.toContain(excluded)
  const rowsDom = [...container.querySelectorAll("tbody tr")]
  expect(rowsDom).toHaveLength(2)
  expect(rowsDom[0]?.textContent).toContain(expected.firstRowText)
  expect(rowsDom[1]?.textContent).toContain(expected.secondRowText)
  for (const cell of expected.dashCells ?? []) {
    expect(rowsDom[cell.row]?.children[cell.child]?.textContent).toBe("—")
  }
  expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(
    expected.hrefs,
  )
  return rowsDom
}

export function expectQueueCardPassthrough(
  text: string,
  phrases: string[],
) {
  for (const phrase of phrases) expect(text).toContain(phrase)
}

export function expectQueueCardEmpty(
  text: string,
  emptyText: string,
) {
  expect(text).toContain(emptyText)
}
