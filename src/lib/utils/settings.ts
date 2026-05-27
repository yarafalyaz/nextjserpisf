
import { prisma } from '@/lib/db/prisma'
import { cache } from 'react'

/**
 * System settings singleton with React cache.
 * Cached per-request in RSC — avoids redundant DB queries within a single render.
 * Creates default settings if none exist.
 */
export const getSystemSettings = cache(async () => {
  let settings = await prisma.systemSetting.findFirst()

  if (!settings) {
    settings = await prisma.systemSetting.create({
      data: {
        companyName: 'Yara ERP',
        companyEmail: 'admin@yaraerp.co.id',
        companyPhone: null,
        companyAddress: null,
        companyLogo: null,
        costingMethod: 'FIFO',
        fiscalYearStartMonth: 1,
        currencyCode: 'IDR',
        currencySymbol: 'Rp ',
        currencyLocale: 'id_ID',
        // Auto-code prefixes
        itemCodePrefix: 'ITM-',
        enableAutoItemCode: true,
        warehouseCodePrefix: 'WH-',
        enableAutoWarehouseCode: true,
        rackCodePrefix: 'RCK-',
        enableAutoRackCode: true,
        rowCodePrefix: 'ROW-',
        enableAutoRowCode: true,
        customerCodePrefix: 'CUST-',
        enableAutoCustomerCode: true,
        employeeCodePrefix: 'EMP-',
        enableAutoEmployeeCode: true,
        vendorCodePrefix: 'VEND-',
        enableAutoVendorCode: true,
        // Document prefixes
        quotationCodePrefix: 'QUO',
        assetPrefix: 'ISF',
        salesOrderPrefix: 'SO',
        salesInvoicePrefix: 'INV',
        salesPaymentPrefix: 'PAY',
        salesReturnPrefix: 'SR',
        purchaseRequestPrefix: 'PR',
        purchaseOrderPrefix: 'PO',
        inventoryTransferPrefix: 'TRF',
        stockAdjustmentPrefix: 'ADJ',
        workOrderPrefix: 'WO',
        timesheetPrefix: 'TS',
        downPaymentPrefix: 'DP',
        deliveryOrderPrefix: 'DO',
        journalPrefix: 'JRN',
        expensePrefix: 'EXP',
        pettyCashPrefix: 'PC',
        reconciliationPrefix: 'REC',
        payrollPrefix: 'PAYROLL',
        projectPrefix: 'PRJ',
        goodsReceiptPrefix: 'GR',
        vendorBillPrefix: 'BILL',
        vendorPaymentPrefix: 'VPAY',
        purchaseReturnPrefix: 'PRET',
        ticketPrefix: 'TKT',
        leadPrefix: 'LEAD',
        materialIssuePrefix: 'MI',
        manufacturingOrderPrefix: 'MO',
        stockMovementPrefix: 'SM',
        // Overtime
        overtimeMultiplier: 0.00578035,
        overtimeCoefficient: 1.10,
        overtimeMealBreakStart: '17:00',
        overtimeMealBreakEnd: '19:00',
        // Attendance
        attendanceRadiusKm: 1.00,
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
    })
  }

  return settings
})

/**
 * Get a specific setting value by key.
 * Falls back to the full settings object.
 */
export async function getSettingValue<T = string>(
  key: keyof Awaited<ReturnType<typeof getSystemSettings>>
): Promise<T | null> {
  const settings = await getSystemSettings()
  const value = settings[key]
  return (value as T) ?? null
}
