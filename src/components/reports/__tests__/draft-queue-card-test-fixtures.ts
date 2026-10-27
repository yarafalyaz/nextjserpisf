import { expect } from "vitest"

// Asersi bersama tes kartu antrean draft (056-S pesanan + 057-S faktur).
// Sonar menandai blok asersi salin-tempel antar kedua berkas tes sebagai
// duplikasi kode-baru; simpan sekali di sini (pola project-pl-test-fixtures).
// Tiap pemanggil tetap memberi nilai persis domainnya — helper tidak
// menghitung ulang apa pun, hanya memeriksa payload builder apa adanya.

export function expectDraftQueueHeaders(text: string, headers: readonly string[]) {
  headers.forEach((header) => expect(text).toContain(header))
}

export function expectDraftQueueSummary(
  text: string,
  title: string,
  staleCountLabel: string,
  waitingCountLabel: string,
  totalDocumentsLabel: string,
  draftValueLabel: string,
  noticeText: string,
) {
  expect(text).toContain(title)
  expect(text).toContain(staleCountLabel)
  expect(text).toContain(waitingCountLabel)
  expect(text).toContain(totalDocumentsLabel)
  expect(text).toContain(draftValueLabel)
  expect(text).toContain(noticeText)
}

export function expectExcludedDocuments(text: string, documentNos: readonly string[]) {
  documentNos.forEach((documentNo) => expect(text).not.toContain(documentNo))
}

export function expectDraftQueueRowOrder(
  rowsDom: readonly Element[],
  firstDocumentNo: string,
  secondDocumentNo: string,
) {
  expect(rowsDom).toHaveLength(2)
  expect(rowsDom[0]?.textContent).toContain(firstDocumentNo)
  expect(rowsDom[1]?.textContent).toContain(secondDocumentNo)
}

export function expectDraftQueueAges(text: string) {
  expect(text).toContain("16 hari")
  expect(text).toContain("2 hari")
}

export function expectDraftQueueSellerCells(rowsDom: readonly Element[]) {
  // Penjual null tampil persis `—` (fallback karangan = MERAH).
  expect(rowsDom[1]?.children[2]?.textContent).toBe("—")
  expect(rowsDom[0]?.children[2]?.textContent).toBe("Sari Sales")
}

export function expectDraftQueueDateCells(
  rowsDom: readonly Element[],
  filledDateLabel: string,
  emptyDateLabel: string,
) {
  expect(rowsDom[0]?.children[5]?.textContent).toBe(filledDateLabel)
  expect(rowsDom[1]?.children[5]?.textContent).toBe(emptyDateLabel)
}

export function expectDraftQueueDetailLinks(
  container: HTMLElement,
  linkText: string,
  firstHref: string,
  secondHref: string,
) {
  const detailLinks = Array.from(container.querySelectorAll("a")).filter(
    (a) => a.textContent === linkText,
  )
  expect(detailLinks).toHaveLength(2)
  expect(detailLinks[0]?.getAttribute("href")).toBe(firstHref)
  expect(detailLinks[1]?.getAttribute("href")).toBe(secondHref)
}

export function expectNoQueueButtons(container: HTMLElement) {
  expect(container.querySelectorAll("button")).toHaveLength(0)
}
