import { describe, it, expect } from "vitest"
import { fitColumnWidths, renderStatementPdf, renderStatementPdfBytes, renderTablePdf, renderTablePdfBytes } from "../render"
import type { StatementDocument, TableDocument, TableRow } from "../types"
import type { StatementTable, StatementTableRow } from "@/lib/reports/statement-table"

function table(rows: StatementTableRow[], includePercent = false): StatementTable {
  return {
    columns: [
      { header: "Kode", align: "left" },
      { header: "Deskripsi", align: "left" },
      { header: "Per 31 Oktober 2026", align: "right" },
      ...(includePercent ? [{ header: "%", align: "right" as const }] : []),
    ],
    rows,
  }
}

function document(over: Partial<StatementDocument> = {}): StatementDocument {
  return {
    letterhead: {
      companyName: "PT Yara ERP",
      addressLines: ["Jl. Contoh No 35", "Kenanga, Cipondoh, Kota Tangerang, Banten 15146"],
      contactParts: ["Telp: 08123", "a@b.com"],
      logo: null,
    },
    title: "Neraca (Standar)",
    subtitle: "Laporan Posisi Keuangan",
    periodCaption: "Per 31 Oktober 2026",
    metaRight: "Mata Uang: Indonesian Rupiah",
    table: table([
      { kind: "group", label: "Aset" },
      {
        kind: "line",
        id: 1,
        code: "1000",
        name: "Kas",
        level: 0,
        hasChildren: false,
        values: ["5.000.000"],
      },
      { kind: "subtotal", label: "Jumlah Aset", values: ["5.000.000"] },
      { kind: "grand", label: "Total Kewajiban dan Ekuitas", values: ["5.000.000"] },
    ]),
    printFooter: "Dicetak: 13/10/2026 10.22 oleh Budi",
    signatures: ["Dibuat oleh", "Diperiksa oleh", "Disetujui oleh"],
    ...over,
  }
}

/** Isi PDF sebagai teks latin1 — jsPDF menulis stream tanpa kompresi. */
function pdfText(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Buffer.from(view).toString("latin1")
}

const PT_PER_MM = 72 / 25.4

/** Potongan teks beserta posisinya (mm) — untuk memeriksa penempatan kolom. */
function pdfTextItems(bytes: ArrayBuffer | Uint8Array): { x: number; y: number; text: string }[] {
  const content = pdfText(bytes)
  const pattern = /(-?[\d.]+) (-?[\d.]+) Td\s*\(((?:\\.|[^()\\])*)\) Tj/g
  const items: { x: number; y: number; text: string }[] = []
  for (const match of content.matchAll(pattern)) {
    items.push({
      x: Number(match[1]) / PT_PER_MM,
      y: Number(match[2]) / PT_PER_MM,
      text: match[3],
    })
  }
  return items
}

describe("renderStatementPdf", () => {
  it("menghasilkan berkas PDF yang sah", () => {
    const bytes = renderStatementPdfBytes(document())

    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-")
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it("menulis kop, judul, dan baris periode", () => {
    const text = pdfText(renderStatementPdfBytes(document()))

    expect(text).toContain("PT YARA ERP")
    // Tanda kurung di dalam PDF di-escape ("\(…\)"), jadi hanya kata kuncinya diuji.
    expect(text).toContain("NERACA")
    expect(text).toContain("Laporan Posisi Keuangan")
    expect(text).toContain("Per 31 Oktober 2026")
    expect(text).toContain("Kas")
    expect(text).toContain("5.000.000")
  })

  it("menulis nomor halaman di footer", () => {
    const text = pdfText(renderStatementPdfBytes(document()))
    expect(text).toContain("Halaman 1 dari 1")
    expect(text).toContain("Dicetak:")
  })

  it("memecah laporan panjang ke beberapa halaman dan mengulang header kolom", () => {
    const rows: StatementTableRow[] = [{ kind: "group", label: "Aset" }]
    for (let index = 1; index <= 90; index += 1) {
      rows.push({
        kind: "line",
        id: index,
        code: `1${String(index).padStart(3, "0")}`,
        name: `Akun ${index}`,
        level: 0,
        hasChildren: false,
        values: [String(index * 1000)],
      })
    }

    const doc = renderStatementPdf(document({ table: table(rows) }))
    const pages = doc.getNumberOfPages()

    expect(pages).toBeGreaterThan(1)

    const text = pdfText(doc.output("arraybuffer") as ArrayBuffer)
    expect(text).toContain(`Halaman 1 dari ${pages}`)
    expect(text).toContain(`Halaman ${pages} dari ${pages}`)
    // Header kolom digambar ulang per halaman → "Deskripsi" muncul > 1 kali.
    expect(text.split("Deskripsi").length - 1).toBeGreaterThan(1)
  })

  it("menggambar kolom persen bila tabel punya dua kolom angka", () => {
    const doc = renderStatementPdf(
      document({
        table: table(
          [
            {
              kind: "line",
              id: 1,
              code: "4000",
              name: "Penjualan",
              level: 0,
              hasChildren: false,
              values: ["1.000.000", "100.0%"],
            },
          ],
          true,
        ),
      }),
    )

    expect(Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1")).toContain("100.0%")
  })

  it("tetap mencetak kop tanpa logo saat data logo tidak terbaca", () => {
    const doc = renderStatementPdf(
      document({
        letterhead: {
          companyName: "PT Yara ERP",
          addressLines: [],
          contactParts: [],
          logo: { dataUrl: "data:image/png;base64,TIDAK-VALID", width: 400, height: 100 },
        },
      }),
    )

    expect(doc.getNumberOfPages()).toBe(1)
    expect(Buffer.from(doc.output("arraybuffer") as ArrayBuffer).toString("latin1")).toContain("PT YARA ERP")
  })

  it("meletakkan blok tanda tangan di halaman baru bila tabel mengisi halaman", () => {
    const rows: StatementTableRow[] = []
    for (let index = 1; index <= 80; index += 1) {
      rows.push({
        kind: "line",
        id: index,
        code: `1${String(index).padStart(3, "0")}`,
        name: `Akun ${index}`,
        level: 0,
        hasChildren: false,
        values: [String(index * 1000)],
      })
    }

    const doc = renderStatementPdf(document({ table: table(rows) }))
    const text = pdfText(doc.output("arraybuffer") as ArrayBuffer)

    expect(text).toContain("Disetujui oleh")
    expect(text).toContain("Halaman 1 dari " + doc.getNumberOfPages())
  })
})

// ─── Tabel generik (laporan berbentuk daftar) ────────────────────────────────

const REGISTER_COLUMNS = [
  { header: "Kode", align: "left" as const, width: 20 },
  { header: "Nama Aset", align: "left" as const, width: 75 },
  { header: "Status", align: "left" as const, width: 24 },
  { header: "Tgl Perolehan", align: "center" as const, width: 26 },
  { header: "Harga Perolehan", align: "right" as const, width: 40 },
  { header: "Akum. Penyusutan", align: "right" as const, width: 40 },
  { header: "Nilai Buku", align: "right" as const, width: 38 },
]

function tableDocument(rows: TableRow[], over: Partial<TableDocument> = {}): TableDocument {
  return {
    letterhead: {
      companyName: "PT Yara ERP",
      addressLines: ["Jl. Contoh No 35"],
      contactParts: ["Telp: 08123"],
      logo: null,
    },
    title: "Daftar Aset Tetap",
    subtitle: "Posisi Aset per Tanggal",
    periodCaption: "Per 31 Oktober 2026",
    metaRight: "Mata Uang: Indonesian Rupiah",
    table: { columns: REGISTER_COLUMNS, rows },
    printFooter: "Dicetak: 13/10/2026 10.22 oleh Budi",
    signatures: ["Dibuat oleh", "Diperiksa oleh", "Disetujui oleh"],
    landscape: true,
    ...over,
  }
}

describe("renderTablePdf", () => {
  const rows: TableRow[] = [
    { kind: "group", label: "Peralatan Bengkel" },
    {
      kind: "data",
      cells: ["AST-001", "Mesin Bubut", "Aktif", "10/01/2026", "100.000.000", "20.000.000", "80.000.000"],
    },
    { kind: "total", label: "Subtotal Peralatan Bengkel", cells: ["100.000.000", "20.000.000", "80.000.000"] },
    { kind: "total", grand: true, label: "TOTAL", cells: ["100.000.000", "20.000.000", "80.000.000"] },
  ]

  it("menghasilkan berkas PDF yang sah", () => {
    const bytes = renderTablePdfBytes(tableDocument(rows))
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-")
  })

  it("memakai halaman mendatar dan menulis kolom, baris, dan totalnya", () => {
    const doc = renderTablePdf(tableDocument(rows))

    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 0)
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(210, 0)

    const text = pdfText(doc.output("arraybuffer") as ArrayBuffer)
    expect(text).toContain("DAFTAR ASET TETAP")
    expect(text).toContain("Akum. Penyusutan")
    expect(text).toContain("PERALATAN BENGKEL")
    expect(text).toContain("Mesin Bubut")
    expect(text).toContain("80.000.000")
    expect(text).toContain("Halaman 1 dari 1")
  })

  it("memakai halaman tegak bila tidak diminta mendatar", () => {
    const doc = renderTablePdf(tableDocument(rows, { landscape: false }))
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0)
  })

  it("memecah daftar panjang ke beberapa halaman dan mengulang header kolom", () => {
    const longRows: TableRow[] = [{ kind: "group", label: "Peralatan Bengkel" }]
    for (let index = 1; index <= 120; index += 1) {
      longRows.push({
        kind: "data",
        cells: [
          `AST-${String(index).padStart(3, "0")}`,
          `Aset ${index}`,
          "Aktif",
          "10/01/2026",
          "1.000.000",
          "100.000",
          "900.000",
        ],
      })
    }

    const doc = renderTablePdf(tableDocument(longRows))
    const pages = doc.getNumberOfPages()
    const text = pdfText(doc.output("arraybuffer") as ArrayBuffer)

    expect(pages).toBeGreaterThan(1)
    expect(text).toContain(`Halaman ${pages} dari ${pages}`)
    // Header kolom digambar ulang per halaman → "Nama Aset" muncul > 1 kali.
    expect(text.split("Nama Aset").length - 1).toBeGreaterThan(1)
  })

  it("menulis catatan di bawah tabel", () => {
    const doc = renderTablePdf(
      tableDocument([...rows, { kind: "notice", text: "Perhatian: ada aset dengan nilai buku negatif." }]),
    )
    expect(pdfText(doc.output("arraybuffer") as ArrayBuffer)).toContain("nilai buku negatif")
  })

  it("menyejajarkan sel angka baris total dengan kolom terakhir, bukan kolom pertama", () => {
    // Regresi: sel baris total pernah digambar memakai kolom pertama sehingga angka
    // total muncul di bawah "Kode"/"Nama Aset", bukan di bawah kolomnya.
    const items = pdfTextItems(renderTablePdfBytes(tableDocument(rows)))

    const totalLabel = items.find((item) => item.text === "TOTAL")
    expect(totalLabel).toBeDefined()

    const totalRow = items.filter((item) => Math.abs(item.y - (totalLabel?.y ?? 0)) < 0.5)
    const inRow = (text: string) => totalRow.find((item) => item.text === text)

    // Kolom (mm): Kode 15–35, Nama 35–110, Status 110–134, Tgl 134–160,
    // Harga Perolehan 160–200, Akum. Penyusutan 200–240, Nilai Buku 240–278.
    const cost = inRow("100.000.000")
    const accumulated = inRow("20.000.000")
    const bookValue = inRow("80.000.000")

    expect(cost && cost.x).toBeGreaterThan(160)
    expect(cost && cost.x).toBeLessThan(200)
    expect(accumulated && accumulated.x).toBeGreaterThan(200)
    expect(accumulated && accumulated.x).toBeLessThan(240)
    expect(bookValue && bookValue.x).toBeGreaterThan(240)
    expect(bookValue && bookValue.x).toBeLessThan(282)
  })

  it("fit-to-width: Σwidth 422mm diskalakan proporsional ke area isi 267mm", () => {
    const wide = [
      { header: "Tanggal", align: "left" as const, width: 28 },
      { header: "No. Jurnal", align: "left" as const, width: 36 },
      { header: "Keterangan", align: "left" as const, width: 80 },
      { header: "Debit", align: "right" as const, width: 36 },
      { header: "Kredit", align: "right" as const, width: 36 },
      { header: "Saldo", align: "right" as const, width: 36 },
      { header: "Debit 2", align: "right" as const, width: 57 },
      { header: "Kredit 2", align: "right" as const, width: 57 },
      { header: "Saldo 2", align: "right" as const, width: 56 },
    ]
    const scaled = fitColumnWidths(wide, 267)
    const sum = scaled.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(267, 5)
    // Proporsi dipertahankan: Keterangan tetap 80/28 × kolom pertama.
    expect(scaled[2] / scaled[0]).toBeCloseTo(80 / 28, 5)
    // Di bawah area isi: tidak diskalakan.
    expect(fitColumnWidths(wide.slice(0, 3), 267)).toEqual([28, 36, 80])
  })

  it("tabel lebar: tepi kanan kolom terakhir tidak lampaui area isi landscape", () => {
    const doc = renderTablePdf(
      tableDocument(
        [{ kind: "data", cells: ["10/01/2026", "JU-001", "Kas masuk penjualan tunai", "1.000", "0", "1.000", "2.000", "0", "3.000"] }],
        {
          table: {
            columns: [
              { header: "Tanggal", align: "left", width: 28 },
              { header: "No. Jurnal", align: "left", width: 36 },
              { header: "Keterangan", align: "left", width: 80 },
              { header: "Debit", align: "right", width: 36 },
              { header: "Kredit", align: "right", width: 36 },
              { header: "Saldo", align: "right", width: 36 },
              { header: "Debit 2", align: "right", width: 57 },
              { header: "Kredit 2", align: "right", width: 57 },
              { header: "Saldo 2", align: "right", width: 56 },
            ],
            rows: [{ kind: "data", cells: ["10/01/2026", "JU-001", "Kas masuk", "1.000", "0", "1.000", "2.000", "0", "3.000"] }],
          },
        },
      ),
    )
    const items = pdfTextItems(doc.output("arraybuffer") as ArrayBuffer)
    // Area isi landscape: margin 15mm kiri, tepi kanan 297-15=282mm.
    for (const item of items) {
      expect(item.x).toBeLessThanOrEqual(282.5)
    }
    const last = items.find((item) => item.text === "3.000")
    expect(last).toBeDefined()
    expect(last && last.x).toBeGreaterThan(240)
    expect(last && last.x).toBeLessThanOrEqual(282.5)
  })

  it("menaruh label baris data di kolomnya masing-masing", () => {
    const items = pdfTextItems(renderTablePdfBytes(tableDocument(rows)))
    const machine = items.find((item) => item.text === "Mesin Bubut")
    const status = items.find((item) => item.text === "Aktif")

    // Nama Aset mulai di x = 35mm, Status di x = 110mm.
    expect(machine && machine.x).toBeGreaterThanOrEqual(34)
    expect(machine && machine.x).toBeLessThan(40)
    expect(status && status.x).toBeGreaterThanOrEqual(109)
    expect(status && status.x).toBeLessThan(115)
  })
})
