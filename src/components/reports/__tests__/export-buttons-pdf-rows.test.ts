// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

import { collectPdfTableRows, collectTruncationNotes } from "../export-buttons"

function tableFixture(): HTMLTableElement {
  const table = document.createElement("table")
  table.innerHTML = `
    <thead><tr><th>Item</th><th>Qty</th></tr></thead>
    <tbody>
      <tr><td>A</td><td>2</td></tr>
      <tr><td>B</td><td>3</td></tr>
    </tbody>
    <tfoot><tr><td>Total</td><td>5</td></tr></tfoot>`
  // jsdom tidak menghitung innerText; samakan dengan textContent untuk fixture.
  table.querySelectorAll("th, td").forEach((cell) => {
    Object.defineProperty(cell, "innerText", { get: () => cell.textContent })
  })
  return table
}

describe("putaran 82: baris PDF DOM", () => {
  it("menyertakan baris tfoot sebagai baris akhir body", () => {
    const { headers, body } = collectPdfTableRows(tableFixture())
    expect(headers).toEqual(["Item", "Qty"])
    expect(body).toEqual([
      ["A", "2"],
      ["B", "3"],
      ["Total", "5"],
    ])
  })

  it("catatan pemotongan dikumpulkan sekali dari dokumen", () => {
    const host = document.createElement("div")
    host.innerHTML = `
      <div data-report-truncation="data ditampilkan 500 baris pertama"></div>
      <div data-report-truncation=""></div>`
    expect(collectTruncationNotes(host)).toEqual([
      "TERPOTONG: data ditampilkan 500 baris pertama",
    ])
  })
})
