/**
 * Formatting helpers for YaraERP.
 * Currency (IDR), dates, numbers, and percentages.
 */

// Intl formatter dibuat sekali per proses — format* dipanggil ribuan kali
// per render; konstruksi per panggilan adalah biaya murni (locale/opsi tetap).
const numberFmtCache = new Map<number, Intl.NumberFormat>()
function idNumberFmt(decimals: number): Intl.NumberFormat {
  let fmt = numberFmtCache.get(decimals)
  if (!fmt) {
    fmt = new Intl.NumberFormat("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    numberFmtCache.set(decimals, fmt)
  }
  return fmt
}
const FMT_DAY_MONTH_YEAR = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })
const FMT_MONTH_YEAR = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
const FMT_QUANTITY = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 })
const FMT_COMPACT = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 })

/**
 * Format a number as Indonesian Rupiah currency.
 * Example: 1500000 → "Rp 1.500.000"
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options?: {
    symbol?: string;
    decimals?: number;
    showSymbol?: boolean;
  },
): string {
  const { symbol = "Rp ", decimals = 0, showSymbol = true } = options ?? {};

  const numericAmount = Number(amount ?? 0);

  if (Number.isNaN(numericAmount)) return showSymbol ? `${symbol}0` : "0";

  const formatted = idNumberFmt(decimals).format(numericAmount);

  return showSymbol ? `${symbol}${formatted}` : formatted;
}

/**
 * Format a number in accounting convention: thousands-separated, negatives in
 * parentheses, zero as an em-dash. Mirrors how Accurate/Jurnal/Zahir present
 * figures on financial statements.
 * Examples:
 *   1500000  → "1.500.000"
 *   -250000  → "(250.000)"
 *   0        → "–"
 * Pass showSymbol to prefix the currency symbol (default off; statements usually
 * print a single symbol in the column header, not per row).
 */
export function formatAccounting(
  amount: number | string | null | undefined,
  options?: {
    symbol?: string;
    decimals?: number;
    showSymbol?: boolean;
    zeroDash?: boolean;
  },
): string {
  const {
    symbol = "Rp ",
    decimals = 0,
    showSymbol = false,
    zeroDash = true,
  } = options ?? {};

  const numericAmount = Number(amount ?? 0);
  if (Number.isNaN(numericAmount)) return zeroDash ? "–" : "0";

  // Treat sub-cent magnitudes as zero so float drift never prints "(0)".
  if (zeroDash && Math.abs(numericAmount) < 0.005) return "–";

  const magnitude = Math.abs(numericAmount);
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(magnitude);

  const body = showSymbol ? `${symbol}${formatted}` : formatted;
  return numericAmount < 0 ? `(${body})` : body;
}

/**
 * Format a number with Indonesian locale (dot as thousands separator).
 * Example: 1500000.5 → "1.500.000,5"
 */
export function formatNumber(
  value: number | string | null | undefined,
  decimals: number = 0,
): string {
  const numericValue = Number(value ?? 0);

  if (Number.isNaN(numericValue)) return "0";

  return idNumberFmt(decimals).format(numericValue);
}

/**
 * Pesan penolakan PUT-LOAN-1 (satu kalimat, tanpa nominal gaji lawan).
 * `phase`: "susun" (slip belum terbit) vs "bayar" (slip tersimpan).
 * Dipakai builder penjaga + aksi; formatCurrency pola AC-REP-003.
 * Rumah di format.ts supaya builder laporan bebas Intl ad-hoc.
 */
export function loanBudgetGuardMessage(
  breach: { totalDeductions: number; gross: number },
  phase: "susun" | "bayar",
): string {
  const verb = phase === "susun" ? "Susun slip" : "Pembayaran slip"
  return (
    `${verb} ditolak: Σ potongan termasuk statutori (cicilan pinjaman + BPJS/PPh21 + potongan lain) ` +
    `${formatCurrency(breach.totalDeductions)} melebihi bruto ` +
    `${formatCurrency(breach.gross)} (BR-LOAN-03) — sesuaikan cicilan/potongan, jangan dipangkas diam-diam.`
  )
}

/**
 * Format a date to Indonesian locale string.
 * Example: "2024-01-15" → "15 Januari 2024"
 *
 * Varian tanggal yang dipakai renderer bersama laporan (AC-REP-003): tanpa
 * opsi baru di signature lama — semua memaku `timeZone: "Asia/Jakarta"`:
 * - formatDayMonthYear: "1 Okt 2026" (day numeric, month short)
 * - formatMonthYear: "Oktober 2026" (month long, year numeric)
 * - formatDate(..., { format: "short" }): "05 Okt 2026" (day 2-digit, month short)
 */
export function formatDayMonthYear(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return "-";
  return FMT_DAY_MONTH_YEAR.format(dateObj);
}

/** "Oktober 2026" — label grup bulan + judul kolom, zona WIB dipaku. */
export function formatMonthYear(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return "-";
  return FMT_MONTH_YEAR.format(dateObj);
}

/**
 * Rentang dua tanggal seperiode label kolom: "1 Okt - 31 Okt 2026".
 * Bentuk ringkas (tanpa tahun ganda) warisan label kolom laba-rugi —
 * dipaku di satu helper supaya builder tak merakit manual (AC-REP-003).
 */
export function formatShortRange(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
  const a = typeof start === "string" ? new Date(start) : start;
  const b = typeof end === "string" ? new Date(end) : end;
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "-";
  const dayMonth = (d: Date) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Jakarta",
    }).format(d);
  const endDayMonthYear = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(b);
  return `${dayMonth(a)} - ${endDayMonthYear}`;
}

/**
 * Kuantitas / hitungan: ribuan titik, desimal koma, tanpa simbol.
 * Example: 1500 → "1.500"; 2.5 → "2,5".
 */
export function formatQuantity(value: number | string | null | undefined): string {
  const numericValue = Number(value ?? 0);
  if (Number.isNaN(numericValue)) return "0";
  const text = FMT_QUANTITY.format(numericValue);
  return text === "-0" ? "0" : text;
}

/**
 * Uang dalam kalimat temuan/nota (bukan sel tabel): "Rp1.500.000".
 * Sel tabel tetap lewat formatAccounting/formatCurrency.
 *
 * ponytail: tanpa pemakai, kandidat hapus; plafon: pakai di temuan builder
 * bila butuh varian tanpa spasi "Rp ".
 */
export function formatRpCompact(value: number | string | null | undefined): string {
  return `Rp${formatNumber(value)}`;
}

/**
 * Label sumbu grafik yang ringkas (mis. "1,2 jt").
 * Pengecualian sah ratchet AC-REP-003: `notation: "compact"` tidak punya
 * padanan di helper lain; helper ini memaku locale id-ID di satu tempat.
 */
export function formatCompactNumber(value: number | string | null | undefined): string {
  const numericValue = Number(value ?? 0);
  if (Number.isNaN(numericValue)) return "0";
  return FMT_COMPACT.format(numericValue);
}

/**
 * Kunci tanggal kalender WIB "YYYY-MM-DD" dari sebuah instan.
 * Dipaku ke zona Asia/Jakarta lewat Intl agar bebas zona runtime proses/CI.
 * Dipakai mesin SLA (samakan dengan tanggal Holiday) — BUKAN label tampilan,
 * jadi diizinkan eksis di samping helper label (pengecualian sah ratchet).
 */
export function wibDateKeyParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Komponen jam dinding WIB (tahun..menit + weekday en-US pendek) dari instan.
 * Sama seperti di atas: mesin hitung, bukan label — pengecualian sah.
 */
export function wibPartsKey(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

/**
 * Cap waktu cetak dokumen: "28 Oktober 2026 07.30 WIB" — tanggal panjang +
 * jam dinding WIB. Dipaku di satu helper supaya kop CSV, footer PDF klien,
 * dan kop server tidak membuat tiga format jam sendiri-sendiri (AC-REP-003).
 */
export function formatPrintedAtWib(now: Date | string | null | undefined): string {
  if (!now) return "-"
  const dateObj = typeof now === "string" ? new Date(now) : now
  if (Number.isNaN(dateObj.getTime())) return "-"
  const parts = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).formatToParts(dateObj)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("day")} ${get("month")} ${get("year")} ${get("hour")}.${get("minute")} WIB`
}

export function formatDate(
  date: Date | string | null | undefined,
  options?: {
    format?: "short" | "long" | "numeric";
    includeTime?: boolean;
  },
): string {
  if (!date) return "-";

  const { format = "long", includeTime = false } = options ?? {};

  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(dateObj.getTime())) return "-";

  const dateOptions: Intl.DateTimeFormatOptions = (() => {
    switch (format) {
      case "short":
        return { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" } as const;
      case "numeric":
        return { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jakarta" } as const;
      case "long":
      default:
        return { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" } as const;
    }
  })();

  if (includeTime) {
    dateOptions.hour = "2-digit";
    dateOptions.minute = "2-digit";
  }

  return new Intl.DateTimeFormat("id-ID", dateOptions).format(dateObj);
}

/**
 * Format a date to relative time string.
 * Example: "2 jam yang lalu", "3 hari yang lalu"
 */
export function formatRelativeTime(
  date: Date | string | null | undefined,
): string {
  if (!date) return "-";

  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return "-";

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  // Future dates: diffMs is negative. Guard so we don't mislabel a
  // scheduled/future timestamp as "Baru saja".
  if (diffMs < 0) return formatDate(dateObj);
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} menit yang lalu`;
  if (diffHours < 24) return `${diffHours} jam yang lalu`;
  if (diffDays < 7) return `${diffDays} hari yang lalu`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} minggu yang lalu`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} bulan yang lalu`;
  return `${Math.floor(diffDays / 365)} tahun yang lalu`;
}

/**
 * Format a percentage value.
 * Example: 0.115 → "11,5%"
 */
export function formatPercentage(
  value: number | string | null | undefined,
  decimals: number = 1,
  /** If true, treat value as fraction (0.11 = 11%). Default false = value is already percentage. */
  isFraction: boolean = false,
): string {
  const numericValue = Number(value ?? 0);

  if (Number.isNaN(numericValue)) return "0%";

  // Fix #52: Explicit flag instead of ambiguous auto-detection
  const percentage = isFraction ? numericValue * 100 : numericValue;

  return `${formatNumber(percentage, decimals)}%`;
}

/**
 * Format a file size in bytes to human-readable string.
 * Example: 1048576 → "1 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1,
  );

  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Truncate a string to a maximum length with ellipsis.
 */
export function truncate(
  str: string | null | undefined,
  maxLength: number = 50,
): string {
  if (!str) return "";
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
}

/**
 * Format a phone number to Indonesian format.
 * Example: "08123456789" → "0812-3456-789"
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";

  const cleaned = phone.replace(/\D/g, "");

  if (cleaned.length <= 4) return cleaned;
  if (cleaned.length <= 8) return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    draft: "default",
    pending: "warning",
    approved: "success",
    rejected: "danger",
    cancelled: "danger",
    completed: "success",
    done: "success",
    active: "success",
    sent: "primary",
    posted: "secondary",
    partial: "warning",
    paid: "success",
    accepted: "success",
    converted: "secondary",
    ordered: "primary",
    received: "success",
    processed: "success",
    returned: "warning",
    confirmed: "success",
    DRAFT: "default",
    POSTED: "success",
  };
  return colorMap[status] || "default";
}

/**
 * Format a period string (YYYY-MM) to Indonesian month and year.
 * Example: "2026-05" -> "Mei 2026"
 */
export function formatPeriod(period: string | null | undefined): string {
  if (!period || !period.includes("-")) return period ?? "-";

  const [year, month] = period.split("-");
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const mIndex = Number.parseInt(month, 10) - 1;
  if (mIndex >= 0 && mIndex < 12) {
    return `${months[mIndex]} ${year}`;
  }

  return period;
}

/**
 * Translate database reference type names to friendly Indonesian terms.
 * Example: "SalesInvoice" -> "Faktur Penjualan"
 *
 * F-2026-10-20-102: label terpisah dari `referenceHref` — tipe diberi label
 * Indonesia walau belum punya halaman detail ([slug]) agar kolom Referensi
 * jurnal/buku-besar tidak menampilkan enum mentah; `referenceHref` tetap
 * daftar putih rute yang terbukti ada.
 */
const REFERENCE_TYPE_LABELS: Record<string, string> = {
  SalesInvoice: "Faktur Penjualan",
  SalesInvoiceCOGS: "Faktur Penjualan (HPP)",
  SalesInvoiceReversal: "Pembalikan Faktur Penjualan",
  PurchaseOrder: "Pesanan Pembelian",
  GoodsReceipt: "Penerimaan Barang",
  // Jurnal beban jasa dari penerimaan campuran barang+jasa (penanda terpisah
  // karena `journals` unik pada (reference_type, reference_id) — lihat
  // stock-journal.service). Tanpa label ini tabel jurnal menampilkan enum mentah.
  GoodsReceiptService: "Penerimaan Barang (Jasa)",
  MaterialIssue: "Pengeluaran Bahan",
  StockAdjustment: "Penyesuaian Stok",
  InventoryTransfer: "Transfer Stok",
  SalesReturn: "Retur Penjualan",
  PurchaseReturn: "Retur Pembelian",
  ProductionOrder: "Perintah Produksi",
  ManufacturingOrder: "Perintah Produksi",
  WorkOrder: "Perintah Kerja",
  Expense: "Pengeluaran",
  PettyCash: "Kas Kecil",
  DownPayment: "Uang Muka Penjualan",
  VendorBill: "Tagihan Vendor",
  VendorPayment: "Pembayaran Vendor",
  Payroll: "Penggajian",
  SalesPayment: "Pembayaran Penjualan",
  EmployeeLoan: "Pinjaman Karyawan",
  TaxPayment: "Penyetoran Pajak",
  PurchaseAdvance: "Uang Muka Pembelian",
  CustomerCredit: "Kredit Pelanggan",
  Journal: "Jurnal",
  SalesOrder: "Pesanan Penjualan",
  Quotation: "Penawaran",
  PurchaseRequest: "Permintaan Pembelian",
  Invoice: "Faktur",
  LeaveRequest: "Pengajuan Cuti",
  OvertimeRequest: "Pengajuan Lembur",
  ProductionCost: "Biaya Produksi",
  ProductionOrderMaterialIssue: "Pengeluaran Bahan Produksi",
  ProductionOrderCostVariance: "Selisih Biaya Produksi",
  YearEndClosing: "Tutup Buku Tahunan",
  ASSET_ACQUISITION: "Perolehan Aset",
  ASSET_DISPOSAL: "Pelepasan Aset",
  BANK_TRANSFER: "Transfer Bank",
};

export function formatReferenceType(refType: string | null | undefined): string {
  if (!refType) return "-";
  // Jurnal depresiasi aset memakai penanda berkala `ASSET_DEPRECIATION_YYYYMM`
  // (lihat api/cron/asset-depreciation) — harga mati per bulan tidak mungkin.
  if (/^ASSET_DEPRECIATION_\d{6}$/.test(refType)) return "Depresiasi Aset";
  // Jurnal balik transaksi berulang: `RecurringTransaction_YYYYMMDD`
  // (lihat reverseJournalsByReference di accounting.hook).
  if (/^RecurringTransaction_\d{8}$/.test(refType)) return "Transaksi Berulang";

  return REFERENCE_TYPE_LABELS[refType] || refType;
}

/**
 * Map a stock-move / journal `referenceType` + `referenceId` to the detail page
 * of the source document, so inventory mutations can link back to the document
 * that caused them (GoodsReceipt, ProductionOrder, SalesInvoice, …). Returns
 * null when the type has no known detail route, so callers can fall back to a
 * plain label.
 */
export function referenceHref(
  refType: string | null | undefined,
  refId: number | null | undefined,
  refSlug?: string | null,
): string | null {
  if (!refType || refId == null || Number.isNaN(Number(refId))) return null;
  const id = Number(refId);
  const routes: Record<string, string> = {
    SalesInvoice: "/penjualan/faktur",
    SalesOrder: "/penjualan/pesanan",
    SalesReturn: "/penjualan/retur",
    SalesPayment: "/penjualan/pembayaran",
    Quotation: "/penjualan/penawaran",
    PurchaseOrder: "/pembelian/pesanan",
    PurchaseRequest: "/pembelian/permintaan",
    PurchaseReturn: "/pembelian/retur",
    GoodsReceipt: "/pembelian/penerimaan",
    GoodsReceiptService: "/pembelian/penerimaan",
    GR: "/pembelian/penerimaan",
    ProductionOrder: "/produksi/production-orders",
    ManufacturingOrder: "/produksi/production-orders",
    MaterialIssue: "/inventaris/pengeluaran-material",
    ProductionOrderMaterialIssue: "/produksi/production-orders",
    StockAdjustment: "/inventaris/penyesuaian",
    InventoryTransfer: "/inventaris/transfer",
  };
  const base = routes[refType];
  // Slug kanonis bila pemanggil menyediakannya (resolveReferenceSlugs);
  // tanpa slug jatuh ke id numerik yang tetap diterima resolver halaman.
  return base ? `${base}/${refSlug ?? id}` : null;
}
