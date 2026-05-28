"use server"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function updateSystemSettings(formData: FormData) {
  await requirePermission("manage_settings")

  const settings = await prisma.systemSetting.findFirst()
  if (!settings) throw new Error("System settings not found")

  function has(key: string): boolean {
    return formData.has(key)
  }

  function str(key: string): string | undefined {
    if (!has(key)) return undefined
    const v = formData.get(key)
    return v !== null ? String(v) : undefined
  }

  function strNull(key: string): string | null | undefined {
    if (!has(key)) return undefined
    const v = formData.get(key)
    return v && String(v).trim() !== "" ? String(v) : null
  }

  function int(key: string): number | undefined {
    if (!has(key)) return undefined
    const v = formData.get(key)
    if (!v || String(v).trim() === "") return undefined
    const n = parseInt(String(v), 10)
    return isNaN(n) ? undefined : n
  }

  function intNull(key: string): number | null | undefined {
    if (!has(key)) return undefined
    const v = formData.get(key)
    if (!v || String(v).trim() === "") return null
    const n = parseInt(String(v), 10)
    return isNaN(n) ? null : n
  }

  function decimal(key: string): number | undefined {
    if (!has(key)) return undefined
    const v = formData.get(key)
    if (!v || String(v).trim() === "") return undefined
    const n = parseFloat(String(v))
    return isNaN(n) ? undefined : n
  }

  function decimalNull(key: string): number | null | undefined {
    if (!has(key)) return undefined
    const v = formData.get(key)
    if (!v || String(v).trim() === "") return null
    const n = parseFloat(String(v))
    return isNaN(n) ? null : n
  }

  function bool(key: string): boolean | undefined {
    const values = formData.getAll(key)
    if (values.length === 0) return undefined
    return values.some((v) => {
      const value = String(v).toLowerCase()
      return value === "on" || value === "true" || value === "1" || value === "yes"
    })
  }

  function dateNull(key: string): Date | null | undefined {
    if (!has(key)) return undefined
    const v = formData.get(key)
    if (!v || String(v).trim() === "") return null
    const d = new Date(String(v))
    return isNaN(d.getTime()) ? null : d
  }

  await prisma.systemSetting.update({
    where: { id: settings.id },
    data: {
      // Company Info
      companyName: strNull("companyName"),
      companyEmail: strNull("companyEmail"),
      companyPhone: strNull("companyPhone"),
      companyAddress: strNull("companyAddress"),
      companyProvince: strNull("companyProvince"),
      companyCity: strNull("companyCity"),
      companyDistrict: strNull("companyDistrict"),
      companyVillage: strNull("companyVillage"),
      companyPostalCode: strNull("companyPostalCode"),
      companyWebsite: strNull("companyWebsite"),
      companyTaxId: strNull("companyTaxId"),
      companyLogo: strNull("companyLogo"),
      companyLatitude: decimalNull("companyLatitude"),
      companyLongitude: decimalNull("companyLongitude"),

      // General
      costingMethod: str("costingMethod") || "FIFO",
      fiscalYearStartMonth: int("fiscalYearStartMonth") ?? 1,
      currencyCode: str("currencyCode") || "IDR",
      currencySymbol: str("currencySymbol") || "Rp ",
      currencyLocale: str("currencyLocale") || "id_ID",
      documentNumberFormat: str("documentNumberFormat") || undefined,
      periodLockDate: dateNull("periodLockDate"),
      showIsActiveField: bool("showIsActiveField"),
      showTaxId: bool("showTaxId"),

      // Auto-Code Prefixes
      itemCodePrefix: strNull("itemCodePrefix"),
      enableAutoItemCode: bool("enableAutoItemCode"),
      warehouseCodePrefix: strNull("warehouseCodePrefix"),
      enableAutoWarehouseCode: bool("enableAutoWarehouseCode"),
      rackCodePrefix: strNull("rackCodePrefix"),
      enableAutoRackCode: bool("enableAutoRackCode"),
      rowCodePrefix: strNull("rowCodePrefix"),
      enableAutoRowCode: bool("enableAutoRowCode"),
      customerCodePrefix: strNull("customerCodePrefix"),
      enableAutoCustomerCode: bool("enableAutoCustomerCode"),
      employeeCodePrefix: strNull("employeeCodePrefix"),
      enableAutoEmployeeCode: bool("enableAutoEmployeeCode"),
      vendorCodePrefix: strNull("vendorCodePrefix"),
      enableAutoVendorCode: bool("enableAutoVendorCode"),

      // Document Prefixes
      quotationCodePrefix: str("quotationCodePrefix") || "QUO",
      assetPrefix: strNull("assetPrefix"),
      salesOrderPrefix: str("salesOrderPrefix") || "SO",
      salesInvoicePrefix: str("salesInvoicePrefix") || "INV",
      salesPaymentPrefix: str("salesPaymentPrefix") || "PAY",
      salesReturnPrefix: str("salesReturnPrefix") || "SR",
      purchaseRequestPrefix: str("purchaseRequestPrefix") || "PR",
      purchaseOrderPrefix: str("purchaseOrderPrefix") || "PO",
      inventoryTransferPrefix: str("inventoryTransferPrefix") || "TRF",
      stockAdjustmentPrefix: str("stockAdjustmentPrefix") || "ADJ",
      workOrderPrefix: str("workOrderPrefix") || "WO",
      timesheetPrefix: str("timesheetPrefix") || "TS",
      downPaymentPrefix: str("downPaymentPrefix") || "DP",
      deliveryOrderPrefix: str("deliveryOrderPrefix") || "DO",
      journalPrefix: str("journalPrefix") || "JRN",
      expensePrefix: str("expensePrefix") || "EXP",
      pettyCashPrefix: str("pettyCashPrefix") || "PC",
      reconciliationPrefix: str("reconciliationPrefix") || "REC",
      payrollPrefix: str("payrollPrefix") || "PAYROLL",
      projectPrefix: str("projectPrefix") || "PRJ",
      goodsReceiptPrefix: str("goodsReceiptPrefix") || "GR",
      vendorBillPrefix: str("vendorBillPrefix") || "BILL",
      vendorPaymentPrefix: str("vendorPaymentPrefix") || "VPAY",
      purchaseReturnPrefix: str("purchaseReturnPrefix") || "PRET",
      ticketPrefix: str("ticketPrefix") || "TKT",
      leadPrefix: str("leadPrefix") || "LEAD",
      materialIssuePrefix: str("materialIssuePrefix") || "MI",
      manufacturingOrderPrefix: str("manufacturingOrderPrefix") || "MO",
      stockMovementPrefix: str("stockMovementPrefix") || "SM",

      // Overtime
      overtimeMultiplier: decimal("overtimeMultiplier") ?? 0.00578035,
      overtimeCoefficient: decimal("overtimeCoefficient") ?? 1.1,
      overtimeMealBreakStart: str("overtimeMealBreakStart") || "17:00",
      overtimeMealBreakEnd: str("overtimeMealBreakEnd") || "19:00",

      // Attendance
      attendanceRadiusKm: decimal("attendanceRadiusKm") ?? 1.0,
      latePenaltyPerMinute: decimal("latePenaltyPerMinute") ?? 5000,
      maxLatePenaltyMinutes: int("maxLatePenaltyMinutes") ?? 120,

      // Quotation
      quotationFooterNotes: strNull("quotationFooterNotes"),
      quotationSignatureName: strNull("quotationSignatureName"),
      quotationSignatureImage: strNull("quotationSignatureImage"),

      // Accounting - Sales
      salesReceivableAccountId: intNull("salesReceivableAccountId"),
      salesRevenueAccountId: intNull("salesRevenueAccountId"),
      salesTaxAccountId: intNull("salesTaxAccountId"),
      salesReturnAccountId: intNull("salesReturnAccountId"),
      salesAccountId: intNull("salesAccountId"),

      // Accounting - Purchase
      purchasePayableAccountId: intNull("purchasePayableAccountId"),
      purchaseInventoryAccountId: intNull("purchaseInventoryAccountId"),
      purchaseTaxAccountId: intNull("purchaseTaxAccountId"),
      purchaseExpenseAccountId: intNull("purchaseExpenseAccountId"),
      purchaseDiscountAccountId: intNull("purchaseDiscountAccountId"),
      purchaseShippingAccountId: intNull("purchaseShippingAccountId"),
      purchaseReturnAccountId: intNull("purchaseReturnAccountId"),

      // Accounting - Inventory
      inventoryAccountId: intNull("inventoryAccountId"),
      inventoryAdjustmentAccountId: intNull("inventoryAdjustmentAccountId"),
      stockAdjustmentAccountId: intNull("stockAdjustmentAccountId"),
      cogsAccountId: intNull("cogsAccountId"),
      wipAccountId: intNull("wipAccountId"),
      materialExpenseAccountId: intNull("materialExpenseAccountId"),
      materialIssueExpenseAccountId: intNull("materialIssueExpenseAccountId"),

      // Accounting - General
      pettyCashAccountId: intNull("pettyCashAccountId"),
      cashBankAccountId: intNull("cashBankAccountId"),
      generalExpenseAccountId: intNull("generalExpenseAccountId"),
      defaultCashAccountId: intNull("defaultCashAccountId"),

      // Accounting - Payroll
      salaryExpenseAccountId: intNull("salaryExpenseAccountId"),
      salariesPayableAccountId: intNull("salariesPayableAccountId"),
      payrollBankAccountId: intNull("payrollBankAccountId"),
      employeeReceivableAccountId: intNull("employeeReceivableAccountId"),
      payrollJournalTypeId: intNull("payrollJournalTypeId"),
    },
  })

  revalidatePath("/settings")
  redirect("/settings")
}
