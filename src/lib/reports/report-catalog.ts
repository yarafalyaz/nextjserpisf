import {
  BookOpen,
  HardDrive,
  Hammer,
  Landmark,
  Package,
  Receipt,
  Scale,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react"

/**
 * Pengelompokan katalog laporan untuk halaman `/laporan`.
 *
 * Accurate menamai laporan sebagai **Keluarga (Varian)** — "Laba/Rugi (Standar)",
 * "Laba/Rugi (Multi Periode)", "Neraca (Multi Year)". Itu yang membuat daftarnya
 * terbaca seperti menu berjenjang: keluarganya satu, variannya banyak. Katalog
 * kita dulu hanya grid kartu datar, sehingga "Laba Rugi", "Laba Rugi per Proyek",
 * dan "Laba Rugi per Pusat Biaya" tampak tiga laporan yang tidak berhubungan.
 *
 * File ini SENGAJA hanya berisi pengelompokan dan varian. Judul, ikon, dan izin
 * dibaca dari `navigation.ts` (lewat `moduleItemsForGroup`), sedangkan deskripsi
 * tiap laporan tetap satu sumber di `NAV_CARD_DESCRIPTIONS` — jadi katalog tidak
 * bisa menampilkan keluarga yang tidak ada di menu (dijaga
 * `report-catalog.test.ts`).
 */
export interface ReportCatalogEntry {
  href: string
  /**
   * Nama keluarga laporan. WAJIB berupa awalan dari label menu salah satu
   * anggotanya (mis. "Laba Rugi" untuk `/laporan/laba-rugi`), supaya tidak ada
   * keluarga karangan yang tidak dikenal di navigasi.
   */
  family: string
  /** Varian di dalam keluarga, mis. "Standar", "Multi Periode", "Bank". */
  variant: string
}

/** Laporan yang berdiri sendiri: tampil dengan label menunya apa adanya. */
export interface ReportStandaloneEntry {
  href: string
  family?: undefined
  variant?: undefined
}

export type ReportEntry = ReportCatalogEntry | ReportStandaloneEntry

export interface ReportCategory {
  /** Kunci stabil untuk `key` React. */
  key: string
  label: string
  icon: LucideIcon
  /** Urutan di sini = urutan tampil; anggota satu keluarga dijaga berurutan. */
  reports: ReportEntry[]
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  {
    key: "keuangan",
    label: "Keuangan",
    icon: TrendingUp,
    reports: [
      { href: "/laporan/laba-rugi", family: "Laba Rugi", variant: "Standar" },
      { href: "/laporan/laba-rugi-terealisasi", family: "Laba Rugi", variant: "Terealisasi" },
      { href: "/laporan/laba-rugi-tidak-terealisasi", family: "Laba Rugi", variant: "Tidak Terealisasi" },
      { href: "/laporan/laba-rugi-proyek", family: "Laba Rugi", variant: "Per Proyek" },
      { href: "/laporan/laba-rugi-per-pusat-biaya", family: "Laba Rugi", variant: "Per Pusat Biaya" },
      { href: "/laporan/pusat-laba", family: "Laba Rugi", variant: "Per Pusat Laba" },
      { href: "/laporan/margin-kendaraan" },
      { href: "/laporan/profitabilitas" },
      { href: "/laporan/histori-penjualan" },
      { href: "/laporan/hasil-penawaran" },
      { href: "/laporan/garansi-segera-berakhir" },
      { href: "/laporan/servis-berkala" },
      { href: "/laporan/aging-klaim-supplier" },
      { href: "/laporan/corong-prospek" },
      { href: "/laporan/histori-pembelian" },
      { href: "/laporan/pembelian" },
      { href: "/laporan/neraca", family: "Neraca", variant: "Standar" },
      { href: "/laporan/neraca-skontro", family: "Neraca", variant: "Skontro" },
      { href: "/laporan/neraca-saldo", family: "Neraca", variant: "Percobaan" },
      { href: "/laporan/rasio-keuangan" },
      { href: "/laporan/grafik-keuangan" },
      { href: "/laporan/perubahan-ekuitas" },
      { href: "/laporan/laba-ditahan" },
      { href: "/laporan/arus-kas", family: "Arus Kas", variant: "Per Aktivitas" },
      { href: "/laporan/proyeksi-kas", family: "Arus Kas", variant: "Proyeksi" },
      { href: "/laporan/multi-periode" },
      { href: "/laporan/perbandingan-periode" },
    ],
  },
  {
    key: "buku-besar",
    label: "Buku Besar",
    icon: BookOpen,
    reports: [
      { href: "/laporan/buku-besar", family: "Buku Besar", variant: "Umum" },
      { href: "/laporan/buku-bank", family: "Buku Besar", variant: "Bank" },
      { href: "/laporan/buku-pembantu-piutang", family: "Buku Pembantu", variant: "Piutang" },
      { href: "/laporan/buku-pembantu-utang", family: "Buku Pembantu", variant: "Utang" },
    ],
  },
  {
    key: "kas-bank",
    label: "Kas & Bank",
    icon: Landmark,
    reports: [
      { href: "/laporan/pembayaran-per-bank" },
      { href: "/laporan/beban-pembayaran" },
      { href: "/laporan/transaksi-bank" },
      { href: "/laporan/giro-mundur" },
    ],
  },
  {
    key: "piutang-utang",
    label: "Piutang & Utang",
    icon: Users,
    reports: [
      { href: "/laporan/piutang-jatuh-tempo", family: "Piutang", variant: "Umur" },
      { href: "/laporan/piutang-pelanggan", family: "Piutang", variant: "Per Pelanggan" },
      { href: "/laporan/statement-pelanggan" },
      { href: "/laporan/hutang-jatuh-tempo", family: "Hutang", variant: "Umur" },
      { href: "/laporan/total-hutang", family: "Hutang", variant: "Total" },
      { href: "/laporan/ringkasan-ar-ap" },
      { href: "/laporan/tukar-faktur" },
    ],
  },
  {
    key: "persediaan",
    label: "Persediaan",
    icon: Package,
    reports: [
      { href: "/laporan/valuasi-stok" },
      { href: "/laporan/mutasi-stok" },
      { href: "/laporan/kartu-stok" },
      { href: "/laporan/ringkasan-stok" },
      { href: "/laporan/rekonsiliasi-stok" },
      { href: "/laporan/umur-stok" },
      { href: "/laporan/stok-tidak-bergerak" },
      { href: "/laporan/stok-minimum" },
      { href: "/laporan/penghitungan-stok" },
      { href: "/laporan/nomor-seri-batch" },
    ],
  },
  {
    key: "penjualan",
    label: "Penjualan",
    icon: ShoppingCart,
    reports: [
      { href: "/laporan/analisis-penjualan" },
      { href: "/laporan/riwayat-harga-penawaran" },
      { href: "/laporan/riwayat-harga-jual" },
      { href: "/laporan/paparan-diskon-penjualan" },
      { href: "/laporan/pemenuhan-pesanan" },
      { href: "/laporan/terkirim-belum-terfaktur" },
      { href: "/laporan/rekap-komisi" },
      { href: "/laporan/saldo-utang-komisi" },
      { href: "/laporan/target-penjualan" },
    ],
  },
  {
    key: "pembelian",
    label: "Pembelian",
    icon: ShoppingBag,
    reports: [
      { href: "/laporan/analisis-harga-beli" },
      { href: "/laporan/penerimaan-sebagian" },
      { href: "/laporan/uang-muka-pembelian" },
      { href: "/laporan/harga-pemasok" },
    ],
  },
  {
    key: "aset-tetap",
    label: "Aset Tetap",
    icon: HardDrive,
    reports: [
      { href: "/laporan/aset-tetap" },
      { href: "/laporan/mutasi-aset" },
      { href: "/laporan/disposisi-aset" },
      { href: "/laporan/jurnal-aset" },
      { href: "/laporan/histori-aset" },
      { href: "/laporan/perbedaan-penyusutan" },
      { href: "/laporan/pajak-tangguhan" },
      { href: "/laporan/rekonsiliasi-aset" },
    ],
  },
  {
    key: "produksi",
    label: "Produksi",
    icon: Hammer,
    reports: [
      { href: "/laporan/biaya-pekerjaan" },
      { href: "/laporan/varians-produksi" },
      { href: "/laporan/scrap-material" },
      { href: "/laporan/estimasi-vs-aktual" },
      { href: "/laporan/penyelesaian-pekerjaan" },
      { href: "/laporan/jurnal-pekerjaan" },
      { href: "/laporan/serapan-overhead" },
      { href: "/laporan/wip-berjalan" },
      { href: "/laporan/rekap-borongan" },
    ],
  },
  {
    key: "pajak",
    label: "Pajak",
    icon: Receipt,
    reports: [
      { href: "/laporan/pajak" },
      { href: "/laporan/posisi-spt" },
      { href: "/laporan/rekonsiliasi-ppn" },
      { href: "/laporan/faktur-ppn" },
      { href: "/laporan/bukti-potong-pph" },
      { href: "/laporan/penyetoran-pajak" },
    ],
  },
  {
    key: "sdm",
    label: "SDM",
    icon: Users,
    reports: [
      { href: "/laporan/gaji-karyawan" },
      { href: "/laporan/pph-21" },
      { href: "/laporan/porsi-gaji" },
    ],
  },
  {
    key: "pemeriksaan",
    label: "Pemeriksaan",
    icon: Scale,
    reports: [
      { href: "/laporan/selisih-persediaan" },
      { href: "/laporan/penerimaan-belum-ditagih" },
      { href: "/laporan/transfer-terkirim" },
    ],
  },
]

/** Semua href katalog, apa adanya (untuk penjaga tes). */
export const REPORT_CATALOG_HREFS = REPORT_CATEGORIES.flatMap((category) =>
  category.reports.map((report) => report.href),
)

/**
 * Label tampil: `Keluarga (Varian)` bila laporan punya varian, atau label menu
 * apa adanya bila ia berdiri sendiri — supaya laporan tunggal tidak diberi
 * tanda kurung yang tidak perlu ("Ringkasan AR/AP", bukan "… (Standar)").
 */
export function catalogLabel(entry: ReportEntry, menuLabel: string): string {
  if (!entry.family || !entry.variant) return menuLabel
  return `${entry.family} (${entry.variant})`
}
