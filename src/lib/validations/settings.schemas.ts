import { z } from "zod"
import "./zod-locale";

const optionalString = (max = 255) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNullString = (max = 255) =>
  z.string().max(max).nullable().optional()

const optionalInt = () =>
  z.coerce.number().int().nullable().optional()

const optionalDecimal = () =>
  z.coerce.number().nullable().optional()

// Bounded numeric helpers for settings that feed payroll / geofence / fiscal
// logic. Without bounds a negative latePenaltyPerMinute turns a late penalty
// into a salary BONUS, a negative overtime multiplier flips overtime into a
// deduction, an out-of-range fiscalYearStartMonth/payrollCutoffDay corrupts
// period logic, and a negative radius breaks attendance geofencing.
const boundedInt = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).nullable().optional()

const boundedDecimal = (min: number, max: number) =>
  z.coerce.number().min(min).max(max).nullable().optional()

const nonNegativeDecimal = () =>
  z.coerce.number().min(0).nullable().optional()

const nonNegativeInt = () =>
  z.coerce.number().int().min(0).nullable().optional()

const optionalBool = () =>
  z.boolean().optional()

// ==================== SYSTEM SETTINGS ====================

export const updateSystemSettingsSchema = z.object({
  // Company Info
  companyName: optionalNullString(),
  companyEmail: optionalNullString(),
  companyPhone: optionalNullString(50),
  companyAddress: optionalNullString(500),
  companyProvince: optionalNullString(),
  companyCity: optionalNullString(),
  companyDistrict: optionalNullString(),
  companyVillage: optionalNullString(),
  companyPostalCode: optionalNullString(20),
  companyWebsite: optionalNullString(),
  companyTaxId: optionalNullString(50),
  // NITKU penjual 22 digit (SellerIDTKU Coretax); kosong = ekspor ditolak builder.
  companyNitku: optionalNullString(22),
  // F-2026-10-25-015-V: status PKP perusahaan (enum tertutup; tanggal
  // mulai kewajiban divalidasi silang di aksi — pkp wajib bertanggal).
  // Form kirim string kosong untuk "belum diisi" — normalkan ke null
  // supaya coerce.date tidak mengubah "" menjadi Invalid Date.
  companyPkpStatus: z.enum(["non_pkp", "pkp", "unknown"]).nullable().optional(),
  companyPkpEffectiveFrom: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.date().nullable().optional(),
  ),
  companyPkpSource: optionalNullString(),
  companyLogo: optionalNullString(500),
  companyLogoDark: optionalNullString(500),
  companyLatitude: optionalDecimal(),
  companyLongitude: optionalDecimal(),

  // General
  costingMethod: optionalString(50),
  fiscalYearStartMonth: boundedInt(1, 12),
  currencyCode: optionalString(10),
  currencySymbol: optionalString(10),
  currencyLocale: optionalString(20),
  documentNumberFormat: optionalString(),
  // R-09: `periodLockDate` dikeluarkan dari schema update umum. Bila
  // diterima di sini, field itu lolos validasi lalu terabaikan diam-diam
  // di settings.actions.ts — menyesatkan. Kunci periode hanya berubah
  // lewat proses akhir bulan (period-close.actions.ts).
  showIsActiveField: optionalBool(),
  showTaxId: optionalBool(),
  // F-2026-10-25-035-B (Q-CL2-5): saklar gerbang kredit; hanya terkirim
  // dari form pengaturan oleh pemegang manage_settings.
  creditGateEnabled: optionalBool(),
  defaultProjectStages: optionalString(1000),

  // Auto-Code Prefixes
  itemCodePrefix: optionalNullString(50),
  enableAutoItemCode: optionalBool(),
  warehouseCodePrefix: optionalNullString(50),
  enableAutoWarehouseCode: optionalBool(),
  rackCodePrefix: optionalNullString(50),
  enableAutoRackCode: optionalBool(),
  rowCodePrefix: optionalNullString(50),
  enableAutoRowCode: optionalBool(),
  customerCodePrefix: optionalNullString(50),
  enableAutoCustomerCode: optionalBool(),
  employeeCodePrefix: optionalNullString(50),
  enableAutoEmployeeCode: optionalBool(),
  vendorCodePrefix: optionalNullString(50),
  enableAutoVendorCode: optionalBool(),
  paymentMethodCodePrefix: optionalNullString(50),
  enableAutoPaymentMethodCode: optionalBool(),
  shippingMethodCodePrefix: optionalNullString(50),
  enableAutoShippingMethodCode: optionalBool(),

  // Document Prefixes
  quotationCodePrefix: optionalString(50),
  assetPrefix: optionalNullString(50),
  salesOrderPrefix: optionalString(50),
  salesInvoicePrefix: optionalString(50),
  salesPaymentPrefix: optionalString(50),
  salesReturnPrefix: optionalString(50),
  purchaseRequestPrefix: optionalString(50),
  purchaseOrderPrefix: optionalString(50),
  inventoryTransferPrefix: optionalString(50),
  stockAdjustmentPrefix: optionalString(50),
  workOrderPrefix: optionalString(50),
  timesheetPrefix: optionalString(50),
  downPaymentPrefix: optionalString(50),
  deliveryOrderPrefix: optionalString(50),
  journalPrefix: optionalString(50),
  expensePrefix: optionalString(50),
  pettyCashPrefix: optionalString(50),
  reconciliationPrefix: optionalString(50),
  payrollPrefix: optionalString(50),
  projectPrefix: optionalString(50),
  goodsReceiptPrefix: optionalString(50),
  vendorBillPrefix: optionalString(50),
  vendorPaymentPrefix: optionalString(50),
  purchaseReturnPrefix: optionalString(50),
  ticketPrefix: optionalString(50),
  leadPrefix: optionalString(50),
  materialIssuePrefix: optionalString(50),
  manufacturingOrderPrefix: optionalString(50),
  stockMovementPrefix: optionalString(50),

  // Overtime
  overtimeMultiplier: nonNegativeDecimal(),
  overtimeCoefficient: nonNegativeDecimal(),
  overtimeMealBreakStart: optionalString(10),
  overtimeMealBreakEnd: optionalString(10),
  restBreakStart: optionalString(10),
  restBreakEnd: optionalString(10),

  // Attendance
  attendanceRadiusKm: nonNegativeDecimal(),
  latePenaltyPerMinute: nonNegativeDecimal(),
  maxLatePenaltyMinutes: nonNegativeInt(),
  payrollCutoffDay: boundedInt(1, 31),

  // Quotation
  quotationFooterNotes: optionalNullString(2000),
  quotationSignatureName: optionalNullString(),
  quotationSignatureImage: optionalNullString(500),

  // Accounting - Sales
  salesReceivableAccountId: optionalInt(),
  salesRevenueAccountId: optionalInt(),
  // F-2026-10-28-137-V V1 (SAL-BR-013): akun pendapatan jasa — baris jasa
  // (itemId null atau item isProduct=false) dibukukan ke akun ini, bukan ke
  // akun pendapatan barang. Kosong = posting faktur berjasa ditolak berisik.
  salesServiceRevenueAccountId: optionalInt(),
  salesTaxAccountId: optionalInt(),
  salesReturnAccountId: optionalInt(),
  salesAccountId: optionalInt(),
  // F-2026-10-28 QA (t_de3aba0b): akun uang muka penjualan dari form Mapping
  // Akun; tanpa kunci ini zod membuang field diam-diam sehingga mapping
  // selamanya hanya berasal dari auto-map instalasi.
  customerDownPaymentAccountId: optionalInt(),

  // Accounting - Purchase
  purchasePayableAccountId: optionalInt(),
  purchaseInventoryAccountId: optionalInt(),
  purchaseTaxAccountId: optionalInt(),
  // F-2026-10-23-111-V Putusan 2: tarif PPh final revaluasi fiskal sebagai
  // data master (0..100%), snapshot per peristiwa; kosong = tolak berisik.
  assetFiscalRevaluationFinalTaxRatePercent: boundedDecimal(0, 100),
  assetFiscalRevaluationTaxPayableAccountId: optionalInt(),
  purchaseExpenseAccountId: optionalInt(),
  purchaseDiscountAccountId: optionalInt(),
  purchaseShippingAccountId: optionalInt(),
  purchaseAdminFeeAccountId: optionalInt(),
  purchaseReturnAccountId: optionalInt(),

  // Accounting - Inventory
  inventoryAccountId: optionalInt(),
  inventoryAdjustmentAccountId: optionalInt(),
  stockAdjustmentAccountId: optionalInt(),
  cogsAccountId: optionalInt(),
  wipAccountId: optionalInt(),
  materialExpenseAccountId: optionalInt(),
  materialIssueExpenseAccountId: optionalInt(),
  // F-008 (tak terbatas; tanpa ini parseFormData membuang field diam-diam)
  abnormalScrapPostingEnabled: z.preprocess(
    (v) => (Array.isArray(v) ? v.some((x) => ["on", "true", "1", "yes"].includes(String(x).toLowerCase())) : v),
    z.boolean().optional(),
  ),
  abnormalScrapExpenseAccountId: optionalInt(),

  // Accounting - Garansi (F-2026-10-28 QA t_de3aba0b): beban garansi 510104,
  // provisi garansi 210205, piutang klaim supplier 110508 — semuanya jalur
  // uang fail-closed (warranty-journal.service, deferred-tax-nonaset-data).
  warrantyExpenseAccountId: optionalInt(),
  warrantyProvisionAccountId: optionalInt(),
  supplierClaimReceivableAccountId: optionalInt(),

  // Accounting - General
  pettyCashAccountId: optionalInt(),
  cashBankAccountId: optionalInt(),
  generalExpenseAccountId: optionalInt(),
  defaultCashAccountId: optionalInt(),
  // F-2026-10-28 QA (t_de3aba0b): utang reimbursement 210209.
  reimbursementLiabilityAccountId: optionalInt(),

  // Accounting - Payroll
  salaryExpenseAccountId: optionalInt(),
  salariesPayableAccountId: optionalInt(),
  payrollBankAccountId: optionalInt(),
  employeeReceivableAccountId: optionalInt(),
  payrollJournalTypeId: optionalInt(),

  // Accounting - Fixed Assets
  depreciationExpenseAccountId: optionalInt(),
  accumulatedDepreciationAccountId: optionalInt(),

  // Accounting - Year-End Closing (F-2026-10-23-121-V): akun laba ditahan
  // tujuan jurnal penutup dari form Mapping Akun; tanpa kunci ini zod
  // membuang field diam-diam dan akun tidak pernah tersimpan.
  retainedEarningsAccountId: optionalInt(),

  // Accounting - Denda Piutang (F-2026-10-22-093-V P2d): akun pendapatan
  // denda dari form Mapping Akun; tanpa kunci ini zod membuang field
  // diam-diam dan terbit denda selamanya fail-closed.
  lateFeeIncomeAccountId: optionalInt(),

  // Internal
  _redirectTo: optionalString(500),
})

// ==================== STORAGE SETTINGS ====================

export const updateStorageSettingsSchema = z.object({
  storageDriver: z.string().max(50).optional().default("local"),
  storageFallbackLocal: optionalBool(),
  assetBaseUrl: optionalNullString(500),
  r2AccountId: optionalNullString(),
  r2AccessKeyId: optionalNullString(),
  r2Bucket: optionalNullString(),
  r2SecretAccessKey: optionalString(500),
})
