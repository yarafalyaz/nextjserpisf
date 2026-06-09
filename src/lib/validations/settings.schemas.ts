import { z } from "zod"

const optionalString = (max = 255) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNullString = (max = 255) =>
  z.string().max(max).nullable().optional()

const optionalInt = () =>
  z.number().int().nullable().optional()

const optionalDecimal = () =>
  z.number().nullable().optional()

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
  companyLogo: optionalNullString(500),
  companyLatitude: optionalDecimal(),
  companyLongitude: optionalDecimal(),

  // General
  costingMethod: optionalString(50),
  fiscalYearStartMonth: optionalInt(),
  currencyCode: optionalString(10),
  currencySymbol: optionalString(10),
  currencyLocale: optionalString(20),
  documentNumberFormat: optionalString(),
  periodLockDate: optionalNullString(),
  showIsActiveField: optionalBool(),
  showTaxId: optionalBool(),

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
  overtimeMultiplier: optionalDecimal(),
  overtimeCoefficient: optionalDecimal(),
  overtimeMealBreakStart: optionalString(10),
  overtimeMealBreakEnd: optionalString(10),
  restBreakStart: optionalString(10),
  restBreakEnd: optionalString(10),

  // Attendance
  attendanceRadiusKm: optionalDecimal(),
  latePenaltyPerMinute: optionalDecimal(),
  maxLatePenaltyMinutes: optionalInt(),
  payrollCutoffDay: optionalInt(),

  // Quotation
  quotationFooterNotes: optionalNullString(2000),
  quotationSignatureName: optionalNullString(),
  quotationSignatureImage: optionalNullString(500),

  // Accounting - Sales
  salesReceivableAccountId: optionalInt(),
  salesRevenueAccountId: optionalInt(),
  salesTaxAccountId: optionalInt(),
  salesReturnAccountId: optionalInt(),
  salesAccountId: optionalInt(),

  // Accounting - Purchase
  purchasePayableAccountId: optionalInt(),
  purchaseInventoryAccountId: optionalInt(),
  purchaseTaxAccountId: optionalInt(),
  purchaseExpenseAccountId: optionalInt(),
  purchaseDiscountAccountId: optionalInt(),
  purchaseShippingAccountId: optionalInt(),
  purchaseReturnAccountId: optionalInt(),

  // Accounting - Inventory
  inventoryAccountId: optionalInt(),
  inventoryAdjustmentAccountId: optionalInt(),
  stockAdjustmentAccountId: optionalInt(),
  cogsAccountId: optionalInt(),
  wipAccountId: optionalInt(),
  materialExpenseAccountId: optionalInt(),
  materialIssueExpenseAccountId: optionalInt(),

  // Accounting - General
  pettyCashAccountId: optionalInt(),
  cashBankAccountId: optionalInt(),
  generalExpenseAccountId: optionalInt(),
  defaultCashAccountId: optionalInt(),

  // Accounting - Payroll
  salaryExpenseAccountId: optionalInt(),
  salariesPayableAccountId: optionalInt(),
  payrollBankAccountId: optionalInt(),
  employeeReceivableAccountId: optionalInt(),
  payrollJournalTypeId: optionalInt(),

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
