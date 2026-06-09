"use server"

import { getErrorMessage } from "@/lib/utils/error"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { logActivity } from "@/lib/services/activity-log.service"
import { parseFormData } from "@/lib/validations/parse-form"
import { updateSystemSettingsSchema, updateStorageSettingsSchema } from "@/lib/validations/settings.schemas"

export async function updateSystemSettings(formData: FormData) {
  try {
  await requirePermission("manage_settings")

  const parsed = parseFormData(updateSystemSettingsSchema, formData)
  if (!parsed.success) {
    throw new Error(parsed.error)
  }

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

  function strDefault(key: string, fallback: string): string | undefined {
    if (!has(key)) return undefined
    const value = str(key)
    return value && value.trim() !== "" ? value : fallback
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

  function intDefault(key: string, fallback: number): number | undefined {
    if (!has(key)) return undefined
    return int(key) ?? fallback
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

  function decimalDefault(key: string, fallback: number): number | undefined {
    if (!has(key)) return undefined
    return decimal(key) ?? fallback
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
      costingMethod: strDefault("costingMethod", "FIFO"),
      fiscalYearStartMonth: intDefault("fiscalYearStartMonth", 1),
      currencyCode: strDefault("currencyCode", "IDR"),
      currencySymbol: strDefault("currencySymbol", "Rp "),
      currencyLocale: strDefault("currencyLocale", "id_ID"),
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
      paymentMethodCodePrefix: strNull("paymentMethodCodePrefix"),
      enableAutoPaymentMethodCode: bool("enableAutoPaymentMethodCode"),
      shippingMethodCodePrefix: strNull("shippingMethodCodePrefix"),
      enableAutoShippingMethodCode: bool("enableAutoShippingMethodCode"),

      // Document Prefixes
      quotationCodePrefix: strDefault("quotationCodePrefix", "QUO"),
      assetPrefix: strNull("assetPrefix"),
      salesOrderPrefix: strDefault("salesOrderPrefix", "SO"),
      salesInvoicePrefix: strDefault("salesInvoicePrefix", "INV"),
      salesPaymentPrefix: strDefault("salesPaymentPrefix", "PAY"),
      salesReturnPrefix: strDefault("salesReturnPrefix", "SR"),
      purchaseRequestPrefix: strDefault("purchaseRequestPrefix", "PR"),
      purchaseOrderPrefix: strDefault("purchaseOrderPrefix", "PO"),
      inventoryTransferPrefix: strDefault("inventoryTransferPrefix", "TRF"),
      stockAdjustmentPrefix: strDefault("stockAdjustmentPrefix", "ADJ"),
      workOrderPrefix: strDefault("workOrderPrefix", "WO"),
      timesheetPrefix: strDefault("timesheetPrefix", "TS"),
      downPaymentPrefix: strDefault("downPaymentPrefix", "DP"),
      deliveryOrderPrefix: strDefault("deliveryOrderPrefix", "DO"),
      journalPrefix: strDefault("journalPrefix", "JRN"),
      expensePrefix: strDefault("expensePrefix", "EXP"),
      pettyCashPrefix: strDefault("pettyCashPrefix", "PC"),
      reconciliationPrefix: strDefault("reconciliationPrefix", "REC"),
      payrollPrefix: strDefault("payrollPrefix", "PAYROLL"),
      projectPrefix: strDefault("projectPrefix", "PRJ"),
      goodsReceiptPrefix: strDefault("goodsReceiptPrefix", "GR"),
      vendorBillPrefix: strDefault("vendorBillPrefix", "BILL"),
      vendorPaymentPrefix: strDefault("vendorPaymentPrefix", "VPAY"),
      purchaseReturnPrefix: strDefault("purchaseReturnPrefix", "PRET"),
      ticketPrefix: strDefault("ticketPrefix", "TKT"),
      leadPrefix: strDefault("leadPrefix", "LEAD"),
      materialIssuePrefix: strDefault("materialIssuePrefix", "MI"),
      manufacturingOrderPrefix: strDefault("manufacturingOrderPrefix", "MO"),
      stockMovementPrefix: strDefault("stockMovementPrefix", "SM"),

      // Overtime
      overtimeMultiplier: decimalDefault("overtimeMultiplier", 0.00578035),
      overtimeCoefficient: decimalDefault("overtimeCoefficient", 1.1),
      overtimeMealBreakStart: strDefault("overtimeMealBreakStart", "17:00"),
      overtimeMealBreakEnd: strDefault("overtimeMealBreakEnd", "19:00"),
      restBreakStart: strDefault("restBreakStart", "12:00"),
      restBreakEnd: strDefault("restBreakEnd", "13:00"),

      // Attendance
      attendanceRadiusKm: decimalDefault("attendanceRadiusKm", 1.0),
      latePenaltyPerMinute: decimalDefault("latePenaltyPerMinute", 5000),
      maxLatePenaltyMinutes: intDefault("maxLatePenaltyMinutes", 120),
      payrollCutoffDay: intDefault("payrollCutoffDay", 25),

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

  revalidatePath("/pengaturan")
  await logActivity("update", "SystemSetting", settings.id, "Memperbarui pengaturan sistem")
  const { safeInternalPath } = await import("@/lib/utils/safe-redirect")
  const redirectTo = safeInternalPath(str("_redirectTo"), "/pengaturan")
  redirect(redirectTo)

  } catch (e: unknown) {
    console.error("[updateSystemSettings]", getErrorMessage(e) || e)
    throw e
  }
}


/**
 * Update storage / CDN configuration. The R2 secret access key is only
 * overwritten when a new non-empty value is submitted (so the masked field
 * in the UI doesn't wipe the stored secret on save).
 */
export async function updateStorageSettings(formData: FormData) {
  try {
    await requirePermission("manage_settings")

    const parsed = parseFormData(updateStorageSettingsSchema, formData)
    if (!parsed.success) {
      throw new Error(parsed.error)
    }

    const settings = await prisma.systemSetting.findFirst()
    if (!settings) throw new Error("System settings not found")

    const get = (key: string) => {
      const v = formData.get(key)
      return v !== null ? String(v).trim() : ""
    }

    const driver = get("storageDriver") || "local"
    const fallbackLocal = formData.get("storageFallbackLocal") !== null
    const assetBaseUrl = get("assetBaseUrl").replace(/\/$/, "") || null
    const r2AccountId = get("r2AccountId") || null
    const r2AccessKeyId = get("r2AccessKeyId") || null
    const r2Bucket = get("r2Bucket") || null
    const newSecret = get("r2SecretAccessKey")

    await prisma.systemSetting.update({
      where: { id: settings.id },
      data: {
        storageDriver: driver,
        storageFallbackLocal: fallbackLocal,
        assetBaseUrl,
        r2AccountId,
        r2AccessKeyId,
        r2Bucket,
        // Only overwrite the secret when a new value is provided
        ...(newSecret ? { r2SecretAccessKey: newSecret } : {}),
      },
    })

    revalidatePath("/pengaturan/penyimpanan")
    await logActivity("update", "SystemSetting", settings.id, "Memperbarui konfigurasi penyimpanan/CDN")
    redirect("/pengaturan/penyimpanan")
  } catch (e: unknown) {
    if (
      typeof e === "object" && e !== null && "digest" in e &&
      typeof (e as { digest?: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e
    }
    console.error("[updateStorageSettings]", getErrorMessage(e) || e)
    throw e
  }
}
