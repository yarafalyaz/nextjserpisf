import { z } from "zod";
import { dateOnly } from "@/lib/validations/finance.schemas";
import { parseMoneyAmount } from "@/lib/utils/parse-money";
import { taxInvoiceNumber } from "@/lib/validations/tax-invoice.schemas";

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

/**
 * Tanggal date-only opsional untuk dokumen penjualan.
 *
 * Sebelumnya tanggal memakai `optionalString(50)`/`z.string().max(50)`:
 * "2026-02-30" lolos zod lalu `new Date(...)` di aksi menggulirkannya
 * diam-diam ke 2 Mar. Kini `dateOnly` menolak tanggal tak-kalender;
 * aksi mengonversi lewat `wibDateToUtcMidnight`.
 */
const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
);

const requiredId = z.coerce.number().int().min(1, "ID wajib diisi");
const optionalId = z.coerce.number().int().min(1).optional();

// ==================== QUOTATION ====================

export const updateQuotationSchema = z.object({
  customerId: optionalId,
  customerVehicleId: optionalId,
  date: optionalDate,
  validUntil: optionalDate,
  paymentMethod: optionalString(200),
  shippingMethod: optionalString(200),
  notes: optionalString(500),
});

// ==================== DOWN PAYMENT ====================

export const createDownPaymentSchema = z.object({
  quotationId: requiredId,
  amount: z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number({ message: "Jumlah uang muka wajib diisi" }).min(1, "Jumlah uang muka harus lebih dari 0"),
  ),
  paymentDate: dateOnly,
  paymentMethod: optionalString(200),
  notes: optionalString(500),
});

export const updateDownPaymentSchema = createDownPaymentSchema;

// ==================== SALES ORDER ====================

export const createSalesOrderSchema = z.object({
  customerId: requiredId,
  quotationId: optionalId,
  date: dateOnly,
  deliveryDate: optionalDate,
  notes: optionalString(500),
  // F-2026-10-25-035-B: alasan permintaan override gerbang kredit (wajib
  // diisi peminta saat percobaan tertahan; diabaikan bila gerbang mati).
  creditOverrideReason: optionalString(1000),
  // Item disalin dari penawaran di dalam aksi; taxRate/discount hanya dipakai
  // bila pengguna menimpanya lewat form.
  taxRate: z.coerce.number().optional(),
  discount: z.coerce.number().optional(),
});

export const updateSalesOrderSchema = z.object({
  customerId: requiredId,
  quotationId: optionalId,
  date: dateOnly,
  deliveryDate: optionalDate,
  notes: optionalString(500),
  creditOverrideReason: optionalString(1000),
  // Line items may be edited until a real settlement exists (custom
  // fabrication). Sent as a JSON string like the invoice editor. Per-line values
  // are clamped in the action, so no bounds here (mirrors updateSalesInvoice).
  items: optionalString(50000),
  taxRate: z.coerce.number().optional(),
  discount: z.coerce.number().optional(),
});

// ==================== SALES INVOICE ====================

export const createSalesInvoiceSchema = z.object({
  customerId: requiredId,
  salesOrderId: optionalId,
  quotationId: optionalId,
  date: dateOnly,
  dueDate: optionalDate,
  // Nomor faktur pajak keluaran dari e-Faktur/Coretax (opsional).
  taxInvoiceNumber,
  notes: optionalString(500),
  creditOverrideReason: optionalString(1000),
  // Item boleh ikut saat pembuatan: faktur hasil konversi Pesanan Penjualan
  // harus lahir dengan baris itemnya, bukan header kosong bertotal 0.
  items: optionalString(50000),
  taxRate: z.coerce.number().optional(),
  discount: z.coerce.number().optional(),
});

// taxRate/discount are intentionally NOT min(0)-bounded at the schema layer:
// updateSalesInvoice already clamps a negative taxRate to 0 and a discount
// to [0, subtotal] in-action (see update-invoice-negative-tax regression
// test). Clamping is the established behaviour — a hard schema rejection
// would change the contract from "silently corrected" to "save blocked".
export const updateSalesInvoiceSchema = createSalesInvoiceSchema;

// ==================== SALES PAYMENT ====================

export const createSalesPaymentSchema = z.object({
  salesInvoiceId: requiredId,
  amount: z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number({ message: "Jumlah pembayaran wajib diisi" }).min(1, "Jumlah pembayaran harus lebih dari 0"),
  ),
  paymentDate: dateOnly,
  paymentMethod: z.string().min(1, "Metode pembayaran wajib diisi").max(200),
  accountId: optionalId,
  // PPh yang dipotong pelanggan (opsional) — `amount` di atas tetap berarti kas
  // yang diterima. Batas "amount + potongan tidak boleh melebihi sisa tagihan"
  // diperiksa di action, karena hanya di sana sisa tagihannya diketahui.
  withholdingTypeId: optionalId,
  withholdingAmount: z.preprocess(
    (v) => (v === "" || v == null ? undefined : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().min(0, "Potongan PPh tidak boleh negatif").optional(),
  ),
  withholdingCertificateNo: optionalString(100),
  withholdingDate: optionalDate,
  referenceNo: optionalString(100),
  notes: optionalString(500),
  attachmentIds: optionalString(2000),
});

export const updateSalesPaymentSchema = createSalesPaymentSchema;

// ==================== SALES RETURN ====================

export const createSalesReturnSchema = z.object({
  customerId: requiredId,
  salesInvoiceId: optionalId,
  date: dateOnly,
  reason: optionalString(500),
  // F-004 §3: nomor/tanggal nota retur pajak dicatat apa adanya dari nota
  // Coretax (sistem tidak menerbitkan nomor sendiri). Opsional: retur
  // komersial tanpa nota tetap sah, masa pengurang jatuh ke tanggal retur.
  taxReturnNoteNumber: optionalString(100),
  taxReturnNoteDate: optionalDate,
  items: z.string().min(1, "Items wajib diisi").max(50000),
});

export const updateSalesReturnSchema = createSalesReturnSchema;

// ==================== DELIVERY ORDER ====================

/**
 * Status Pesanan Penjualan yang boleh dibuatkan Surat Jalan.
 *
 * Satu sumber untuk tiga tempat: gerbang di halaman `surat-jalan/tambah`,
 * penjagaan di server action `createDeliveryOrder` (UI bisa dilewati lewat URL /
 * form yang ditempel), dan — lewat uji paritas — daftar status laporan
 * Pemenuhan Pesanan.
 *
 * - `approved`: jalur `/api/workflow` **tanpa** workflow terkonfigurasi menaikkan
 *   SO draft→approved, dan tombol **Setujui** di halaman detail pesanan memakai
 *   jalur itu. Tanpa status ini, pesanan yang baru disetujui tak bisa dikirim.
 * - `confirmed`, `processing`, `completed`: kosakata laporan Pemenuhan Pesanan
 *   (`FULFILLABLE_ORDER_STATUSES`). Pesanan yang sudah dikonfirmasi/diproses/
 *   selesai tapi barnya belum habis dikirim tetap harus bisa disurat-jalankan.
 */
export const DELIVERABLE_ORDER_STATUSES = ["approved", "confirmed", "processing", "completed"] as const;

/** Daftar status di atas dalam bahasa layar, untuk pesan penolakan. */
export const DELIVERABLE_ORDER_STATUS_LABELS = "Disetujui, Dikonfirmasi, Diproses, atau Selesai";

/**
 * Status Faktur Penjualan yang boleh dibuatkan Retur Penjualan.
 *
 * Satu sumber untuk tiga tempat: tombol di detail faktur, saringan daftar di
 * `retur/tambah`, dan penjagaan server `createSalesReturn`. Faktur lunas
 * (`paid`) justru kasus retur paling umum — mengecualikannya membuat retur
 * tidak terjangkau dari UI walau server membolehkannya. `sent` BUKAN status
 * faktur (itu status pesanan/pengiriman) dan tidak termasuk.
 */
export const RETURNABLE_INVOICE_STATUSES = ["posted", "partial", "paid"] as const;

export const createDeliveryOrderSchema = z.object({
  salesOrderId: requiredId,
  date: dateOnly,
  deliveryDate: optionalDate,
  doNumber: optionalString(200),
  shippingAddress: optionalString(500),
  shippingProvince: optionalString(200),
  shippingCity: optionalString(200),
  shippingDistrict: optionalString(200),
  shippingVillage: optionalString(200),
  shippingPostalCode: optionalString(20),
  shippingPhone: optionalString(30),
  vehicleNumber: optionalString(200),
  notes: optionalString(500),
  // Baris barang yang dikirim, JSON dari editor item form surat jalan:
  // [{ salesOrderItemId, itemId, qty }]. Tanpa baris, surat jalan tak bisa
  // dicocokkan ke baris pesanan (DeliveryOrderItem.salesOrderItemId null) dan
  // laporan Pemenuhan Pesanan selalu membaca 0 terkirim — jadi barisnya wajib.
  items: z.string().min(1, "Minimal satu barang yang dikirim").max(50000),
});

export const updateDeliveryOrderSchema = z.object({
  salesOrderId: requiredId,
  date: dateOnly,
  deliveryDate: optionalDate,
  doNumber: optionalString(200),
  shippingAddress: optionalString(500),
  shippingProvince: optionalString(200),
  shippingCity: optionalString(200),
  shippingDistrict: optionalString(200),
  shippingVillage: optionalString(200),
  shippingPostalCode: optionalString(20),
  shippingPhone: optionalString(30),
  vehicleNumber: optionalString(200),
  notes: optionalString(500),
});


// ==================== REVISI PENAWARAN ====================
export const reviseQuotationSchema = z.object({
  changeReason: z.string().trim().min(1, "Alasan perubahan wajib diisi").max(2000, "Alasan perubahan maksimal 2000 karakter"),
});

// ==================== TUKAR FAKTUR ====================

const optionalDateOnly = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
);

/**
 * Satu dokumen tukar faktur (`createInvoiceExchange`).
 *
 * Sebelumnya action parse manual: `receiptNumber` (String tanpa batas) dan
 * `notes` (`@db.Text`) bisa 5MB ke DB, tanggal di-parse
 * `new Date("<text>T00:00:00")` — hasil bergantung TZ proses, padahal form
 * mengirim YYYY-MM-DD hari kalender WIB. Kini `dateOnly` (kalender-valid)
 * dikonversi via `wibDateToUtcMidnight` di action. `invoiceIds` di-parse
 * terpisah di action (parseFormData hanya simpan nilai terakhir per key).
 */
export const invoiceExchangeSchema = z.object({
  date: dateOnly,
  dueDate: optionalDateOnly,
  customerId: z.coerce
    .number({ message: "Pelanggan wajib dipilih" })
    .int()
    .positive("Pelanggan wajib dipilih")
    .max(2_147_483_647, "Pelanggan tidak valid"),
  receiptNumber: optionalString(255),
  notes: optionalString(2000),
});
