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
