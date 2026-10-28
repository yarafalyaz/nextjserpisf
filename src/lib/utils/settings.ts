import { prisma } from "@/lib/db/prisma";
import { cache } from "react";
import { getErrorMessage } from "@/lib/utils/error";

/**
 * Nilai bawaan pengaturan sistem (singleton id 1) — satu sumber untuk jalur
 * upsert DB dan fallback memori saat DB tak terjangkau, supaya keduanya tak
 * pernah berbeda nilai.
 */
const DEFAULT_SYSTEM_SETTINGS = {
  id: 1,
  companyName: "Yara ERP",
  companyEmail: "admin@erp.yarasoft.net",
  companyPhone: null,
  companyAddress: null,
  companyLogo: null,
  costingMethod: "FIFO",
  fiscalYearStartMonth: 1,
  currencyCode: "IDR",
  currencySymbol: "Rp ",
  currencyLocale: "id_ID",
  // Auto-code prefixes
  itemCodePrefix: "ITM-",
  enableAutoItemCode: true,
  warehouseCodePrefix: "WH-",
  enableAutoWarehouseCode: true,
  rackCodePrefix: "RCK-",
  enableAutoRackCode: true,
  rowCodePrefix: "ROW-",
  enableAutoRowCode: true,
  customerCodePrefix: "CUST-",
  enableAutoCustomerCode: true,
  employeeCodePrefix: "EMP-",
  enableAutoEmployeeCode: true,
  vendorCodePrefix: "VEND-",
  enableAutoVendorCode: true,
  paymentMethodCodePrefix: "MTP-",
  enableAutoPaymentMethodCode: true,
  shippingMethodCodePrefix: "MTK-",
  enableAutoShippingMethodCode: true,
  // Document prefixes
  quotationCodePrefix: "QUO",
  assetPrefix: "ISF",
  salesOrderPrefix: "SO",
  salesInvoicePrefix: "INV",
  salesPaymentPrefix: "PAY",
  salesReturnPrefix: "SR",
  purchaseRequestPrefix: "PR",
  purchaseOrderPrefix: "PO",
  inventoryTransferPrefix: "TRF",
  stockAdjustmentPrefix: "ADJ",
  workOrderPrefix: "WO",
  timesheetPrefix: "TS",
  downPaymentPrefix: "DP",
  deliveryOrderPrefix: "DO",
  journalPrefix: "JRN",
  expensePrefix: "EXP",
  pettyCashPrefix: "PC",
  reconciliationPrefix: "REC",
  payrollPrefix: "PAYROLL",
  projectPrefix: "PRJ",
  goodsReceiptPrefix: "GR",
  vendorBillPrefix: "BILL",
  vendorPaymentPrefix: "VPAY",
  purchaseReturnPrefix: "PRET",
  ticketPrefix: "TKT",
  leadPrefix: "LEAD",
  materialIssuePrefix: "MI",
  manufacturingOrderPrefix: "MO",
  stockMovementPrefix: "SM",
  // Overtime
  overtimeMultiplier: 0.00578035,
  overtimeCoefficient: 1.1,
  overtimeMealBreakStart: "17:00",
  overtimeMealBreakEnd: "19:00",
  // Attendance
  attendanceRadiusKm: 1.0,
  latePenaltyPerMinute: 5000,
  maxLatePenaltyMinutes: 120,
  // Accounting defaults
  salesReceivableAccountId: null,
  salesRevenueAccountId: null,
  salesTaxAccountId: null,
  purchasePayableAccountId: null,
  purchaseInventoryAccountId: null,
  purchaseTaxAccountId: null,
  purchaseExpenseAccountId: null,
  inventoryAccountId: null,
  inventoryAdjustmentAccountId: null,
  wipAccountId: null,
  materialExpenseAccountId: null,
  pettyCashAccountId: null,
  salesReturnAccountId: null,
  cashBankAccountId: null,
  generalExpenseAccountId: null,
  stockAdjustmentAccountId: null,
  retainedEarningsAccountId: null,
  // F-2026-10-24-132-V: mapping kompensasi PKWT default kosong (fail-closed).
  pkwtCompensationExpenseAccountId: null,
  pkwtCompensationPayableAccountId: null,
  // F-2026-10-24-135-V: pendapatan besi tua default kosong (fail-closed).
  scrapSaleIncomeAccountId: null,
  // F-2026-10-28-137-V V1 (SAL-BR-013): akun pendapatan jasa default kosong
  // (fail-closed — posting faktur berjasa ditolak bila kosong/nonaktif/salah
  // grup; automap instalasi menebak 400002 Pendapatan Jasa).
  salesServiceRevenueAccountId: null,
  reimbursementLiabilityAccountId: null,
  // F-2026-10-25-020-V Putusan 5: mapping statutori/denda default kosong.
  pph21PayableAccountId: null,
  bpjsEmployeePayableAccountId: null,
  disciplinaryFineIncomeAccountId: null,
};

/**
 * System settings singleton with React cache.
 * Cached per-request in RSC — avoids redundant DB queries within a single render.
 * Creates default settings if none exist.
 */
/**
 * Schema drift (Prisma P2021/P2022: tabel/kolom belum ada di DB) bukan gangguan
 * sesaat — itu error deployment: client lebih baru daripada database. Fallback
 * memori pada kasus itu menyembunyikan masalah sambil menyajikan nilai default
 * yang salah (kejadian 24 Okt 2026: kolom `late_fee_income_account_id` belum
 * ter-push, aplikasi tetap 200 dengan settings karangan). Lempar keras supaya
 * gagalnya terlihat; entrypoint dev sekarang menjalankan `db push` saat start,
 * jadi drift ini seharusnya tidak pernah sampai ke runtime.
 */
function isSchemaDriftError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022") return true;
  return /does not exist in the current database/.test(getErrorMessage(err));
}

export const getSystemSettings = cache(async () => {
  let settings = null;
  try {
    settings = await prisma.systemSetting.findFirst();

    if (!settings) {
      // Upsert on the fixed singleton id so two parallel renders cannot each
      // insert a row (which left duplicate "Yara ERP" settings behind).
      settings = await prisma.systemSetting.upsert({
        where: { id: 1 },
        update: {},
        create: DEFAULT_SYSTEM_SETTINGS,
      });
    }
  } catch (err) {
    if (isSchemaDriftError(err)) {
      console.error(
        "System settings gagal dimuat: skema DB tertinggal dari Prisma schema (drift). Jalankan `npx prisma db push`:",
        getErrorMessage(err) || err,
      );
      throw err;
    }
    // Include the cause. This fallback also fires when the database is
    // unreachable, and without the error detail a total outage looked like a
    // harmless "used defaults" notice (the app silently served hardcoded company
    // name / prefixes / costing method instead of the configured values).
    console.warn(
      "Failed to retrieve or create system settings from DB, using memory fallback:",
      getErrorMessage(err) || err,
    );
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
  }

  return settings;
});

/**
 * Get a specific setting value by key.
 * Falls back to the full settings object.
 */
export async function getSettingValue<T = string>(
  key: keyof Awaited<ReturnType<typeof getSystemSettings>>,
): Promise<T | null> {
  const settings = await getSystemSettings();
  const value = settings[key];
  return (value as T) ?? null;
}
