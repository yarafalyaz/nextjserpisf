import { prisma } from "@/lib/db/prisma";
import { cache } from "react";
import { getErrorMessage } from "@/lib/utils/error";

/**
 * System settings singleton with React cache.
 * Cached per-request in RSC — avoids redundant DB queries within a single render.
 * Creates default settings if none exist.
 */
export const getSystemSettings = cache(async () => {
  let settings = null;
  try {
    settings = await prisma.systemSetting.findFirst();

    if (!settings) {
      settings = await prisma.systemSetting.create({
        data: {
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
        },
      });
    }
  } catch (err) {
    // Include the cause. This fallback also fires when the database is
    // unreachable, and without the error detail a total outage looked like a
    // harmless "used defaults" notice (the app silently served hardcoded company
    // name / prefixes / costing method instead of the configured values).
    console.warn(
      "Failed to retrieve or create system settings from DB, using memory fallback:",
      getErrorMessage(err) || err,
    );
    return {
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
      overtimeMultiplier: 0.00578035,
      overtimeCoefficient: 1.1,
      overtimeMealBreakStart: "17:00",
      overtimeMealBreakEnd: "19:00",
      attendanceRadiusKm: 1.0,
      latePenaltyPerMinute: 5000,
      maxLatePenaltyMinutes: 120,
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
