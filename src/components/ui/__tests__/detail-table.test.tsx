import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "../detail-table"

/**
 * DetailTable adalah fondasi 87 halaman (laporan + halaman modul).
 *
 * Regresi yang dikunci di sini: `<DetailTableHead>` WAJIB menyediakan `<tr>`
 * sendiri, karena pemakaian di seluruh aplikasi menulis `<DetailTableTh>`
 * langsung tanpa `<tr>`. `<th>` yang menjadi anak langsung `<thead>` adalah
 * HTML tidak valid dan memicu hydration error React ("<th> cannot be a child
 * of <thead>") di setiap halaman yang memakainya.
 */
function table(children: React.ReactNode) {
  return renderToStaticMarkup(
    <DetailTable data-report-table="Uji">{children}</DetailTable>,
  )
}

describe("DetailTable", () => {
  it("menyisipkan <tr> di dalam <thead> (th tidak boleh langsung di bawah thead)", () => {
    const html = table(
      <>
        <DetailTableHead>
          <DetailTableTh>Kode</DetailTableTh>
          <DetailTableTh align="right">Jumlah</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          <DetailTableRow>
            <DetailTableTd>4000</DetailTableTd>
            <DetailTableTd align="right">1.000</DetailTableTd>
          </DetailTableRow>
        </DetailTableBody>
      </>,
    )

    expect(html).toMatch(/<thead>\s*<tr\s*>/)
    expect(html).not.toMatch(/<thead>\s*<th/)
  })

  it("memakai kelas dokumen .stmt, bukan tabel berkotak", () => {
    const html = table(<DetailTableBody>{null}</DetailTableBody>)
    expect(html).toContain('class="stmt"')
    expect(html).toContain('data-report-table="Uji"')
  })

  it("menandai sel angka dengan kelas num agar rata kanan", () => {
    const html = table(
      <>
        <DetailTableHead>
          <DetailTableTh align="right">Jumlah</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          <DetailTableRow>
            <DetailTableTd align="right">1.000</DetailTableTd>
          </DetailTableRow>
        </DetailTableBody>
      </>,
    )
    expect(html.match(/class="num"/g)?.length).toBe(2)
  })

  it("meneruskan colSpan (dipakai baris total & sel kosong)", () => {
    const html = table(
      <DetailTableBody>
        <DetailTableRow>
          <DetailTableTd colSpan={3}>Total</DetailTableTd>
        </DetailTableRow>
      </DetailTableBody>,
    )
    // React 19 menulis atributnya sebagai `colSpan` di markup SSR; HTML
    // menganggap nama atribut tidak peka huruf besar/kecil, jadi sama saja.
    expect(html.toLowerCase()).toContain('colspan="3"')
  })

  it("merender tfoot berisi baris", () => {
    const html = table(
      <>
        <DetailTableBody>{null}</DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd colSpan={2}>TOTAL</DetailTableTd>
            <DetailTableTd align="right">1.000</DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </>,
    )
    expect(html).toMatch(/<tfoot>\s*<tr\s*>/)
  })
})
