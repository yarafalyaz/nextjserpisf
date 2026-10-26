/**
 * Detail ekspor PDF laporan yang dibagi halaman dan route `/api/pdf`:
 * label tanda tangan dan pembentuk URL endpoint PDF.
 *
 * URL-nya membawa parameter yang menentukan isi laporan (periode + filter/opsi
 * yang sedang aktif), sehingga PDF selalu memuat baris yang sama dengan yang
 * terlihat di layar.
 */

export type ReportPdfKey =
  | "neraca"
  | "neraca-skontro"
  | "laba-rugi"
  | "laba-rugi-terealisasi"
  | "laba-rugi-tidak-terealisasi"
  | "laba-rugi-pusat-biaya"
  | "rasio-keuangan"
  | "perubahan-ekuitas"
  | "laba-ditahan"
  | "neraca-saldo"
  | "aset-tetap"
  | "mutasi-aset"
  | "disposisi-aset"
  | "jurnal-aset"
  | "histori-aset"
  | "biaya-pekerjaan"
  | "varians-produksi"
  | "scrap-material"
  | "estimasi-vs-aktual"
  | "penyelesaian-pekerjaan"
  | "jurnal-pekerjaan"
  | "pembayaran-per-bank"
  | "penghitungan-stok"
  | "beban-pembayaran"
  | "penerimaan-sebagian"
  | "pemenuhan-pesanan"
  | "terkirim-belum-terfaktur"
  | "selisih-persediaan"
  | "penerimaan-belum-ditagih"
  | "transfer-terkirim"
  | "stok-minimum"
  | "profitabilitas"
  | "histori-penjualan"
  | "histori-pembelian"
  | "pembelian"
  | "gaji-karyawan"
  | "pph-21"
  | "porsi-gaji"
  | "uang-muka-pembelian"
  | "penyetoran-pajak"
  | "tukar-faktur"
  | "transaksi-bank"
  | "faktur-ppn"
  | "ringkasan-ar-ap"
  | "piutang-jatuh-tempo"
  | "hutang-jatuh-tempo"
  | "total-hutang"
  | "piutang-pelanggan"
  | "umur-stok"
  | "stok-tidak-bergerak"
  | "wip-berjalan"
  | "hasil-penawaran"
  | "rekap-borongan"
  | "ringkasan-stok"
  | "rekonsiliasi-stok"
  | "mutasi-stok"
  | "valuasi-stok"
  | "kartu-stok"
  | "posisi-spt"
  | "rekonsiliasi-ppn"
  | "bukti-potong-pph"
  | "analisis-penjualan"
  | "paparan-diskon-penjualan"
  | "buku-besar"
  | "buku-bank"
  | "buku-pembantu-piutang"
  | "statement-pelanggan"
  | "laba-rugi-proyek"
  | "buku-pembantu-utang"
  | "arus-kas"

/** Blok tanda tangan standar laporan keuangan — sama di layar dan di PDF. */
export const STATEMENT_SIGNATURES = ["Dibuat oleh", "Diperiksa oleh", "Disetujui oleh"]

export function buildReportPdfHref(
  report: ReportPdfKey,
  periodSlug: string,
  params?: Record<string, string>,
): string {
  const search = new URLSearchParams({ laporan: report, periode: periodSlug })
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) search.set(key, value)
  }
  return `/api/pdf?${search.toString()}`
}

/** Label berkas unduhan, mis. "Neraca-2026-10.pdf". */
export function reportPdfFilename(report: ReportPdfKey, periodSlug: string): string {
  const base: Record<ReportPdfKey, string> = {
    neraca: "Neraca",
    "neraca-skontro": "Neraca-Skontro",
    "laba-rugi": "Laba-Rugi",
    "laba-rugi-terealisasi": "Laba-Rugi-Terealisasi",
    "laba-rugi-tidak-terealisasi": "Laba-Rugi-Tidak-Terealisasi",
    "laba-rugi-pusat-biaya": "Laba-Rugi-per-Pusat-Biaya",
    "rasio-keuangan": "Rasio-Keuangan",
    "perubahan-ekuitas": "Perubahan-Ekuitas",
    "laba-ditahan": "Laba-Ditahan",
    "neraca-saldo": "Neraca-Saldo",
    "aset-tetap": "Daftar-Aset-Tetap",
    "mutasi-aset": "Mutasi-Aset-Tetap",
    "disposisi-aset": "Daftar-Disposisi-Aset",
    "jurnal-aset": "Jurnal-Aset-Tetap",
    "histori-aset": "Histori-Aset-Tetap",
    "biaya-pekerjaan": "Bahan-dan-Biaya-Pekerjaan",
    "varians-produksi": "Varians-Produksi",
    "scrap-material": "Scrap-Material",
    "estimasi-vs-aktual": "Estimasi-vs-Aktual-Pekerjaan",
    "penyelesaian-pekerjaan": "Penyelesaian-Pesanan",
    "jurnal-pekerjaan": "Jurnal-Pekerjaan-Pesanan",
    "pembayaran-per-bank": "Pembayaran-dan-Penerimaan-per-Bank",
    "penghitungan-stok": "Lembar-Penghitungan-Stok",
    "beban-pembayaran": "Rincian-Beban-Pembayaran",
    "penerimaan-sebagian": "Barang-Diterima-Sebagian",
    "pemenuhan-pesanan": "Pemenuhan-Pesanan",
    "terkirim-belum-terfaktur": "Terkirim-Belum-Terfaktur",
    "selisih-persediaan": "Selisih-Saldo-Akun-Persediaan",
    "penerimaan-belum-ditagih": "Barang-Diterima-Belum-Ditagih",
    "transfer-terkirim": "Persediaan-Terkirim-Belum-Diterima",
    "stok-minimum": "Barang-Stok-Minimum",
    profitabilitas: "Profitabilitas-dan-HPP",
    "histori-penjualan": "Histori-Proses-Penjualan",
    "histori-pembelian": "Histori-Proses-Pembelian",
    pembelian: "Pembelian-per-Kelompok",
    "gaji-karyawan": "Gaji-Karyawan",
    "pph-21": "PPh-21-Karyawan",
    "porsi-gaji": "Porsi-Gaji",
    "uang-muka-pembelian": "Uang-Muka-Pembelian",
    "penyetoran-pajak": "Penyetoran-Pajak",
    "tukar-faktur": "Rincian-Tukar-Faktur",
    "transaksi-bank": "Transaksi-Bank-Terekonsiliasi",
    "faktur-ppn": "Faktur-SPT-Masa-PPN",
    "ringkasan-ar-ap": "Ringkasan-AR-AP",
    "piutang-jatuh-tempo": "Piutang-Jatuh-Tempo",
    "hutang-jatuh-tempo": "Hutang-Jatuh-Tempo",
    "total-hutang": "Total-Hutang",
    "piutang-pelanggan": "Piutang-per-Pelanggan",
    "umur-stok": "Umur-Stok",
    "stok-tidak-bergerak": "Stok-Tidak-Bergerak",
    "wip-berjalan": "Umur-WIP-Berjalan",
    "hasil-penawaran": "Hasil-Penawaran",
    "rekap-borongan": "Rekap-Borongan",
    "ringkasan-stok": "Ringkasan-Persediaan",
    "rekonsiliasi-stok": "Rekonsiliasi-Stok",
    "mutasi-stok": "Mutasi-Stok",
    "valuasi-stok": "Valuasi-Stok",
    "kartu-stok": "Kartu-Stok",
    "posisi-spt": "Posisi-SPT-Masa-PPN",
    "rekonsiliasi-ppn": "Rekonsiliasi-PPN",
    "bukti-potong-pph": "Bukti-Potong-PPh",
    "analisis-penjualan": "Analisis-Penjualan",
    "paparan-diskon-penjualan": "Paparan-Diskon-Penjualan",
    "buku-besar": "Buku-Besar",
    "buku-bank": "Buku-Bank",
    "buku-pembantu-piutang": "Buku-Pembantu-Piutang",
    "statement-pelanggan": "Statement-Pelanggan",
    "laba-rugi-proyek": "Laba-Rugi-per-Proyek",
    "buku-pembantu-utang": "Buku-Pembantu-Utang",
    "arus-kas": "Arus-Kas",
  }
  return `${base[report]}-${periodSlug}.pdf`
}
