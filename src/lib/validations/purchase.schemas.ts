import { z } from "zod"
import "./zod-locale";
import { parseLocaleNumber, parseMoneyAmount } from "@/lib/utils/parse-money"
import { dateOnly } from "@/lib/validations/finance.schemas"
import { taxInvoiceNumber } from "@/lib/validations/tax-invoice.schemas"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

// Nominal opsional berkaki ganda: kosong = undefined (aksi yang membaca), string
// format Indonesia ("2.000.000" / "2.000.000,50") wajib lewat parseMoneyAmount —
// z.coerce.number() mentah menelan NaN dan ditolak zod, dan CurrencyInput
// mengirim string terformat dari form PO/GR/pembayaran. ID murni & kuantitas
// tetap optionalNumber (bukan nominal rupiah).
const optionalMoney = (min = 0) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().min(min).optional(),
  )

const optionalDateOnly = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
)

// ==================== PURCHASE REQUEST ====================

export const purchaseRequestSchema = z.object({
  title: optionalString(200),
  requestedBy: optionalNumber(),
  vendorId: optionalNumber(),
  date: dateOnly,
  requestDate: optionalDateOnly,
  description: optionalString(1000),
  notes: optionalString(1000),
  items: optionalString(10000), // JSON string, parsed separately
})

// ==================== PURCHASE ORDER ====================

export const purchaseOrderSchema = z.object({
  vendorId: z.coerce.number().min(1, "Vendor wajib dipilih"),
  purchaseRequestId: optionalNumber(),
  workOrderId: optionalNumber(),
  isService: z
    .union([z.boolean(), z.literal("true"), z.literal("false"), z.literal("on")])
    .optional()
    .transform((v) => v === true || v === "true" || v === "on"),
  date: dateOnly,
  expectedDate: optionalDateOnly,
  paymentTerm: optionalString(200),
  shippingCost: optionalMoney(),
  serviceFee: optionalMoney(),
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

// ==================== GOODS RECEIPT ====================

/**
 * Tanggal kedaluwarsa baris penerimaan di dalam JSON `items`: `dateOnly`
 * kalender-ketat atau kosong/null. Tanpa ini `new Date("2026-02-30")` di action
 * bergulir diam-diam ke 2 Mar dan string acak jadi Invalid Date ke Prisma.
 */
export const grItemExpiryDate = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  dateOnly.nullable(),
);

export const goodsReceiptSchema = z.object({
  purchaseOrderId: z.coerce.number().min(1, "PO wajib dipilih"),
  warehouseId: z.coerce.number().min(1, "Gudang wajib dipilih"),
  date: dateOnly,
  referenceNumber: optionalString(100),
  notes: optionalString(1000),
  // Actual landed costs for this receipt. Optional: when omitted/0 the hook
  // falls back to this receipt's proportional share of the PO estimate.
  shippingCost: optionalMoney(),
  otherCost: optionalMoney(),
  // Bank/payment admin fee (e.g. "Admin BCA"). Capitalised into HPP and posted
  // to its own expense account.
  adminFee: optionalMoney(),
  items: optionalString(50000), // JSON string, parsed separately
})

// ==================== VENDOR BILL ====================

export const vendorBillSchema = z.object({
  vendorId: z.coerce.number().min(1, "Vendor wajib dipilih"),
  purchaseOrderId: optionalNumber(),
  // Penerimaan yang ditagih — diisi jalur "Buat Tagihan dari Penerimaan"
  // (segmen tagihan/tambah/penerimaan/<slug>). Tanpa entri di sini parseFormData membuang nilainya,
  // jadi VendorBill.goodsReceiptId & VendorBillItem.goodsReceiptItemId tak pernah
  // terisi dan laporan Diterima Belum Ditagih selalu 0.
  goodsReceiptId: optionalNumber(),
  // Jasa maklon per proyek (coating/bending): tagihan ikut HPP proyek.
  projectId: optionalNumber(),
  withholdingTypeId: optionalNumber(),
  withholdingAmount: optionalMoney(),
  date: dateOnly,
  dueDate: optionalDateOnly,
  vendorInvoiceNumber: optionalString(100),
  // Nomor faktur pajak masukan dari pemasok (e-Faktur/Coretax), opsional.
  taxInvoiceNumber,
  terms: optionalString(200),
  notes: optionalString(1000),
  subtotal: z.preprocess(
    (v) => (v === "" || v == null ? 0 : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().min(0, "Subtotal minimal 0").default(0),
  ),
  tax: z.preprocess(
    (v) => (v === "" || v == null ? 0 : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().min(0, "Pajak minimal 0").default(0),
  ),
  grandTotal: z.preprocess(
    (v) => (v === "" || v == null ? 0 : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().min(0, "Grand total minimal 0").default(0),
  ),
  attachmentIds: optionalString(5000), // JSON string
  items: optionalString(50000), // JSON string, parsed separately
})

// ==================== VENDOR PAYMENT ====================

export const vendorPaymentSchema = z.object({
  vendorId: z.coerce.number().min(1, "Vendor wajib dipilih"),
  amount: z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number({ message: "Jumlah pembayaran wajib diisi" }).min(1, "Jumlah pembayaran wajib diisi"),
  ),
  // Bank/transfer admin fee (a real cost of paying, expensed separately — never
  // allocated to a bill).
  adminFee: optionalMoney(),
  // Tagihan spesifik yang dibayar (dipilih lewat tombol "Bayar" di tagihan).
  // Opsional: bila kosong, alokasi konfirmasi murni oldest-first seperti semula.
  vendorBillId: optionalNumber(),
  paymentDate: dateOnly,
  paymentMethod: z.string().min(1, "Metode pembayaran wajib diisi").max(50),
  accountId: optionalNumber(),
  notes: optionalString(1000),
  // Keduanya sudah ada kolomnya di DB dan inputnya di form pembayaran vendor.
  // Tanpa entri di sini, parseFormData membuang nilainya dan yang tersimpan
  // selalu null — nomor referensi & nomor rekening yang diketik operator hilang.
  referenceNumber: optionalString(100),
  bankAccount: optionalString(100),
  attachmentIds: optionalString(5000), // JSON string
})

// ==================== PURCHASE RETURN ====================

export const purchaseReturnSchema = z.object({
  purchaseOrderId: z.coerce.number().min(1, "PO wajib dipilih"),
  date: dateOnly,
  reason: optionalString(1000),
  // F-004 §3: nomor/tanggal nota retur pajak dicatat apa adanya (simetris
  // retur penjualan); opsional, tanpa nota masa pengurang = tanggal retur.
  taxReturnNoteNumber: optionalString(100),
  taxReturnNoteDate: optionalDateOnly,
  items: optionalString(50000), // JSON string, parsed separately
})

// ==================== VENDOR PRICE ====================

/**
 * Satu baris harga pemasok (`createVendorPrice`/`updateVendorPrice`).
 *
 * Sebelumnya kedua action parse manual tanpa batas panjang: `notes` (`@db.Text`)
 * bisa dikirim 5MB ke DB, `minQty` tak berplafon (Decimal(15,2) meledak jadi
 * P2023 mentah), dan `effectiveDate` di-parse `new Date("<text>T00:00:00")` —
 * hasil bergantung TZ proses, padahal form mengirim YYYY-MM-DD hari kalender
 * WIB. Angka di-parse `parseMoneyAmount`/`parseLocaleNumber`, BUKAN
 * `z.coerce.number()` — "2.000.000" akan dibaca `Number()` sebagai 2 dan
 * "1.000" sebagai 1, merusak keunikan (vendorId, itemId, minQty) diam-diam.
 * Plafon 1e12/1e9 menjaga nilai di dalam rentang Decimal(15,2) DB.
 * `effectiveDate` tetap string `dateOnly` (kalender-valid), dikonversi via
 * `wibDateToUtcMidnight` di action.
 */
export const vendorPriceSchema = z.object({
  vendorId: z.coerce
    .number({ message: "Pemasok wajib dipilih" })
    .int()
    .positive("Pemasok wajib dipilih"),
  itemId: z.coerce
    .number({ message: "Barang wajib dipilih" })
    .int()
    .positive("Barang wajib dipilih"),
  price: z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce
      .number({ message: "Harga wajib diisi" })
      .positive("Harga harus lebih dari 0")
      .max(1_000_000_000_000, "Harga melebihi batas"),
  ),
  // Kosong/tak-terbaca → 1 (fallback historis, dipertahankan).
  minQty: z.preprocess(
    (v) => (typeof v === "string" ? (parseLocaleNumber(v) ?? 1) : v),
    z.coerce
      .number({ message: "Minimal qty tidak valid" })
      .positive("Minimal qty harus lebih dari 0")
      .max(1_000_000_000, "Minimal qty melebihi batas"),
  ),
  effectiveDate: optionalDateOnly,
  notes: optionalString(2000),
})


// ==================== VENDOR TRANSFER ====================

/**
 * Penanda transfer pembayaran vendor (`markVendorPaymentsTransferred`).
 *
 * Sebelumnya action parse manual: `reference` (String tanpa batas) bisa 5MB
 * ke DB, tanggal di-parse `new Date("<text>T00:00:00")` — tanggal kalender
 * fiktif (2026-02-30) diterima dan hasilnya bergantung TZ proses. Kini
 * `dateOnly` (kalender-valid) dikonversi via `wibDateToUtcMidnight` di action.
 * `paymentIds` di-parse terpisah di action (parseFormData hanya simpan nilai
 * terakhir per key).
 */
export const vendorTransferSchema = z.object({
  date: dateOnly,
  reference: optionalString(255),
})
