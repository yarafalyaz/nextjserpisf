/**
 * Model dokumen untuk engine PDF server-side.
 *
 * Satu model deklaratif menggambarkan seluruh lembar cetak — kop, judul, tabel,
 * tanda tangan, footer — sehingga tata letak tidak lagi bergantung pada markup
 * halaman. Renderer (`renderStatementPdf`) satu-satunya yang tahu koordinat.
 */

import type { StatementTable } from "@/lib/reports/statement-table"

export interface DocumentLogo {
  /** Data URL (base64) — jsPDF menanamkan gambar secara sinkron. */
  dataUrl: string
  width: number
  height: number
}

export interface DocumentLetterhead {
  companyName: string
  /** Baris alamat kop, sudah dipecah (jalan, lalu wilayah + kode pos). */
  addressLines: string[]
  /** Telp / email / website — digabung pada satu baris. */
  contactParts: string[]
  logo?: DocumentLogo | null
}

export type DocumentAlign = "left" | "right" | "center"

/** Kepala lembar: kop + judul + baris periode. Sama untuk semua jenis dokumen. */
export interface DocumentHeader {
  letterhead: DocumentLetterhead
  title: string
  subtitle?: string
  /** Baris kiri di bawah judul, mis. "Per 31 Oktober 2026". */
  periodCaption: string
  /** Baris kanan di bawah judul, mis. "Mata Uang: Indonesian Rupiah". */
  metaRight?: string
}

export interface StatementDocument extends DocumentHeader {
  table: StatementTable
  /** Kaki halaman kiri, mis. "Dicetak: 13/10/2026 10.22 oleh Budi". */
  printFooter: string
  /** Label blok tanda tangan di bawah tabel. */
  signatures?: string[]
}

/** Kolom tabel generik; `width` dalam mm. */
export interface TableColumn {
  header: string
  align: DocumentAlign
  /** Lebar kolom (mm). Σwidth > area isi diskalakan proporsional oleh renderer (fit-to-width). */
  width: number
}

/**
 * Baris tabel generik — dipakai laporan berbentuk daftar (registry aset, buku
 * besar, kartu stok). Berbeda dari `StatementTableRow` yang selnya adalah
 * kode + nama + kolom angka.
 */
export type TableRow =
  /** Judul kelompok, membentang seluruh kolom. */
  | { kind: "group"; label: string }
  /** Satu baris data; `cells` sejajar dengan kolom. */
  | { kind: "data"; cells: string[]; bold?: boolean }
  /**
   * Subtotal/total: label di kolom kiri, `cells` hanya sel TRAILING (kolom
   * terakhir) — renderer menggambar mulai `columns.length - cells.length`.
   * Builder TIDAK boleh mengisi sel kosong di depan/tengah untuk melewati
   * kolom; angka yang bukan trailing harus jadi data/bold, bukan total.
   */
  | { kind: "total"; label: string; cells: string[]; grand?: boolean }
  /** Catatan/peringatan di bawah tabel. */
  | { kind: "notice"; text: string }

export interface TableDocument extends DocumentHeader {
  table: { columns: TableColumn[]; rows: TableRow[] }
  /** Kaki halaman kiri, mis. "Dicetak: 13/10/2026 10.22 oleh Budi". */
  printFooter: string
  /** Label blok tanda tangan di bawah tabel. */
  signatures?: string[]
  /** Tabel lebar (banyak kolom) lebih nyaman dicetak mendatar. */
  landscape?: boolean
}

