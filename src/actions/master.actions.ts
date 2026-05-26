"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"

// ==================== CUSTOMER ACTIONS ====================

export async function createCustomer(formData: FormData) {
  await requirePermission("create_customers")

  let code = (formData.get("code") as string) || null
  if (!code) {
    code = await generateDocumentNumber("CUST", "simple")
  }

  const customer = await prisma.customer.create({
    data: {
      name: formData.get("name") as string,
      email: formData.get("email") as string | null,
      phone: formData.get("phone") as string | null,
      address: formData.get("address") as string | null,
      city: formData.get("city") as string | null,
      npwp: formData.get("npwp") as string | null,
      contactPerson: formData.get("contactPerson") as string | null,
      gender: (formData.get("gender") as string) || null,
      code,
      street: formData.get("street") as string | null,
      province: formData.get("province") as string | null,
      district: formData.get("district") as string | null,
      village: formData.get("village") as string | null,
      postalCode: formData.get("postalCode") as string | null,
      isActive: true,
    },
  })

  revalidatePath("/master/customers")
  return { success: true, id: customer.id }
}

export async function updateCustomer(customerId: number, formData: FormData) {
  await requirePermission("edit_customers")

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name: formData.get("name") as string,
      email: formData.get("email") as string | null,
      phone: formData.get("phone") as string | null,
      address: formData.get("address") as string | null,
      city: formData.get("city") as string | null,
      npwp: formData.get("npwp") as string | null,
      contactPerson: formData.get("contactPerson") as string | null,
      gender: (formData.get("gender") as string) || null,
      code: (formData.get("code") as string) || null,
      street: formData.get("street") as string | null,
      province: formData.get("province") as string | null,
      district: formData.get("district") as string | null,
      village: formData.get("village") as string | null,
      postalCode: formData.get("postalCode") as string | null,
    },
  })

  revalidatePath("/master/customers")
  return { success: true }
}

export async function deleteCustomer(customerId: number) {
  await requirePermission("delete_customers")

  await prisma.customer.update({
    where: { id: customerId },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/customers")
  return { success: true }
}

// ==================== VENDOR ACTIONS ====================

export async function createVendor(formData: FormData) {
  await requirePermission("create_vendors")

  let code = (formData.get("code") as string) || null
  if (!code) {
    code = await generateDocumentNumber("VND", "simple")
  }

  const vendor = await prisma.vendor.create({
    data: {
      name: formData.get("name") as string,
      code,
      email: formData.get("email") as string | null,
      phone: formData.get("phone") as string | null,
      address: formData.get("address") as string | null,
      city: formData.get("city") as string | null,
      npwp: formData.get("npwp") as string | null,
      contactPerson: formData.get("contactPerson") as string | null,
      paymentTermId: safeId(formData.get("paymentTermId")),
      street: formData.get("street") as string | null,
      province: formData.get("province") as string | null,
      postalCode: formData.get("postalCode") as string | null,
      districtVendor: formData.get("district") as string | null,
      villageVendor: formData.get("village") as string | null,
      bankName: formData.get("bankName") as string | null,
      bankAccountNumber: formData.get("bankAccountNumber") as string | null,
      bankAccountHolder: formData.get("bankAccountHolder") as string | null,
      isActive: true,
    },
  })

  revalidatePath("/master/vendors")
  return { success: true, id: vendor.id }
}

export async function updateVendor(vendorId: number, formData: FormData) {
  await requirePermission("edit_vendors")

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      name: formData.get("name") as string,
      email: formData.get("email") as string | null,
      phone: formData.get("phone") as string | null,
      address: formData.get("address") as string | null,
      city: formData.get("city") as string | null,
      npwp: formData.get("npwp") as string | null,
      contactPerson: formData.get("contactPerson") as string | null,
      paymentTermId: safeId(formData.get("paymentTermId")),
      street: formData.get("street") as string | null,
      province: formData.get("province") as string | null,
      postalCode: formData.get("postalCode") as string | null,
      districtVendor: formData.get("district") as string | null,
      villageVendor: formData.get("village") as string | null,
      bankName: formData.get("bankName") as string | null,
      bankAccountNumber: formData.get("bankAccountNumber") as string | null,
      bankAccountHolder: formData.get("bankAccountHolder") as string | null,
    },
  })

  revalidatePath("/master/vendors")
  return { success: true }
}

// ==================== ITEM ACTIONS ====================

export async function createItem(formData: FormData) {
  await requirePermission("create_items")

  let sku = (formData.get("sku") as string) || null
  if (!sku) {
    sku = await generateDocumentNumber("ITM", "simple")
  }

  const item = await prisma.item.create({
    data: {
      sku,
      name: formData.get("name") as string,
      description: formData.get("description") as string | null,
      image: formData.get("image") as string | null,
      categoryId: safeId(formData.get("categoryId")),
      brandId: safeId(formData.get("brandId")),
      vendorId: safeId(formData.get("vendorId")),
      defaultWarehouseId: safeId(formData.get("defaultWarehouseId")),
      defaultRackId: safeId(formData.get("defaultRackId")),
      defaultRackRowId: safeId(formData.get("defaultRackRowId")),
      unitOfMeasure: formData.get("unitOfMeasure") as string || "PCS",
      qtyOnHand: 0,
      minStock: (safeNumber(formData.get("minStock")) ?? 0),
      cost: (safeNumber(formData.get("cost")) ?? 0),
      price: (safeNumber(formData.get("price")) ?? 0),
      standardCost: safeNumber(formData.get("standardCost")) ?? undefined,
      costingMethod: (formData.get("costingMethod") as string) || undefined,
      purchasePrice: safeNumber(formData.get("purchasePrice")) ?? undefined,
      isProduct: formData.get("isProduct") === "true",
      isActive: true,
    },
  })

  revalidatePath("/master/items")
  return { success: true, id: item.id }
}

export async function updateItem(itemId: number, formData: FormData) {
  await requirePermission("edit_items")

  await prisma.item.update({
    where: { id: itemId },
    data: {
      sku: formData.get("sku") as string,
      name: formData.get("name") as string,
      description: formData.get("description") as string | null,
      image: formData.get("image") as string | null,
      categoryId: safeId(formData.get("categoryId")),
      brandId: safeId(formData.get("brandId")),
      vendorId: safeId(formData.get("vendorId")),
      defaultWarehouseId: safeId(formData.get("defaultWarehouseId")),
      defaultRackId: safeId(formData.get("defaultRackId")),
      defaultRackRowId: safeId(formData.get("defaultRackRowId")),
      unitOfMeasure: formData.get("unitOfMeasure") as string,
      minStock: (safeNumber(formData.get("minStock")) ?? 0),
      cost: (safeNumber(formData.get("cost")) ?? 0),
      price: (safeNumber(formData.get("price")) ?? 0),
      standardCost: safeNumber(formData.get("standardCost")) ?? undefined,
      costingMethod: (formData.get("costingMethod") as string) || undefined,
      purchasePrice: safeNumber(formData.get("purchasePrice")) ?? undefined,
      isProduct: formData.get("isProduct") === "true",
    },
  })

  revalidatePath("/master/items")
  return { success: true }
}

// ==================== WAREHOUSE ACTIONS ====================

export async function createWarehouse(formData: FormData) {
  await requirePermission("create_warehouses")

  let code = (formData.get("code") as string) || null
  if (!code) {
    code = await generateDocumentNumber("WH", "simple")
  }

  const warehouse = await prisma.warehouse.create({
    data: {
      name: formData.get("name") as string,
      code,
      address: formData.get("address") as string | null,
      isActive: true,
    },
  })

  revalidatePath("/master/warehouses")
  return { success: true, id: warehouse.id }
}

export async function updateWarehouse(warehouseId: number, formData: FormData) {
  await requirePermission("edit_warehouses")

  await prisma.warehouse.update({
    where: { id: warehouseId },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      address: formData.get("address") as string | null,
    },
  })

  revalidatePath("/master/warehouses")
  return { success: true }
}

// ==================== EMPLOYEE ACTIONS ====================

export async function createEmployee(formData: FormData) {
  await requirePermission("create_employees")

  let employeeNo = (formData.get("employeeNo") as string) || null
  if (!employeeNo) {
    employeeNo = await generateDocumentNumber("EMP", "simple")
  }

  const employee = await prisma.employee.create({
    data: {
      employeeNo,
      name: formData.get("name") as string,
      email: formData.get("email") as string | null,
      phone: formData.get("phone") as string | null,
      gender: formData.get("gender") as string | null || null,
      dateOfBirth: formData.get("dateOfBirth") ? new Date(formData.get("dateOfBirth") as string) : null,
      maritalStatus: formData.get("maritalStatus") as string | null || null,
      departmentId: safeId(formData.get("departmentId")),
      positionId: safeId(formData.get("positionId")),
      joinDate: new Date(formData.get("joinDate") as string),
      paymentFrequency: (formData.get("paymentFrequency") as string) || "MONTHLY",
      baseSalary: (safeNumber(formData.get("baseSalary")) ?? 0),
      idNumber: formData.get("idNumber") as string | null,
      npwp: formData.get("npwp") as string | null,
      bankName: formData.get("bankName") as string | null,
      bankAccountNumber: formData.get("bankAccountNumber") as string | null,
      bankAccountHolder: formData.get("bankAccountHolder") as string | null,
      bpjsKetenagakerjaan: formData.get("bpjsKetenagakerjaan") as string | null,
      bpjsKesehatan: formData.get("bpjsKesehatan") as string | null,
      street: formData.get("street") as string | null,
      province: formData.get("province") as string | null,
      employeeCity: formData.get("city") as string | null,
      employeeDistrict: formData.get("district") as string | null,
      employeeVillage: formData.get("village") as string | null,
      postalCode: formData.get("postalCode") as string | null,
      isActive: true,
    },
  })

  revalidatePath("/master/employees")
  return { success: true, id: employee.id }
}

export async function updateEmployee(employeeId: number, formData: FormData) {
  await requirePermission("edit_employees")

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      name: formData.get("name") as string,
      email: formData.get("email") as string | null,
      phone: formData.get("phone") as string | null,
      gender: formData.get("gender") as string | null || null,
      dateOfBirth: formData.get("dateOfBirth") ? new Date(formData.get("dateOfBirth") as string) : null,
      maritalStatus: formData.get("maritalStatus") as string | null || null,
      departmentId: safeId(formData.get("departmentId")),
      positionId: safeId(formData.get("positionId")),
      paymentFrequency: (formData.get("paymentFrequency") as string) || "MONTHLY",
      baseSalary: (safeNumber(formData.get("baseSalary")) ?? 0),
      idNumber: formData.get("idNumber") as string | null,
      npwp: formData.get("npwp") as string | null,
      bankName: formData.get("bankName") as string | null,
      bankAccountNumber: formData.get("bankAccountNumber") as string | null,
      bankAccountHolder: formData.get("bankAccountHolder") as string | null,
      bpjsKetenagakerjaan: formData.get("bpjsKetenagakerjaan") as string | null,
      bpjsKesehatan: formData.get("bpjsKesehatan") as string | null,
      street: formData.get("street") as string | null,
      province: formData.get("province") as string | null,
      employeeCity: formData.get("city") as string | null,
      employeeDistrict: formData.get("district") as string | null,
      employeeVillage: formData.get("village") as string | null,
      postalCode: formData.get("postalCode") as string | null,
    },
  })

  revalidatePath("/master/employees")
  return { success: true }
}

// ==================== ACCOUNT (COA) ACTIONS ====================

export async function createAccount(formData: FormData) {
  await requirePermission("create_accounts")

  let code = (formData.get("code") as string) || null
  if (!code) {
    code = await generateDocumentNumber("ACC", "simple")
  }

  const account = await prisma.account.create({
    data: {
      code,
      name: formData.get("name") as string,
      type: formData.get("type") as "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE",
      parentId: safeNumber(formData.get("parentId")),
      isActive: true,
    },
  })

  revalidatePath("/master/accounts")
  return { success: true, id: account.id }
}

// ==================== ITEM CATEGORY ACTIONS ====================

export async function createItemCategory(formData: FormData) {
  await requirePermission("create_item_categories")

  const category = await prisma.itemCategory.create({
    data: {
      name: formData.get("name") as string,
      description: formData.get("description") as string | null,
      parentId: safeNumber(formData.get("parentId")),
    },
  })

  revalidatePath("/master/items")
  return { success: true, id: category.id }
}

export async function updateItemCategory(id: number, formData: FormData) {
  await requirePermission("edit_item_categories")

  await prisma.itemCategory.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      description: formData.get("description") as string | null,
      parentId: safeNumber(formData.get("parentId")),
    },
  })

  revalidatePath("/master/item-categories")
  return { success: true }
}

// ==================== DEPARTMENT ACTIONS ====================

export async function createDepartment(formData: FormData) {
  await requirePermission("create_departments")

  let code = (formData.get("code") as string) || null
  if (!code) {
    code = await generateDocumentNumber("DEPT", "simple")
  }

  const department = await prisma.department.create({
    data: {
      name: formData.get("name") as string,
      code,
      description: formData.get("description") as string | null,
    },
  })

  revalidatePath("/master/employees")
  return { success: true, id: department.id }
}

export async function updateDepartment(id: number, formData: FormData) {
  await requirePermission("edit_departments")

  await prisma.department.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string | null,
      description: formData.get("description") as string | null,
    },
  })

  revalidatePath("/master/departments")
  return { success: true }
}

// ==================== POSITION ACTIONS ====================

export async function createPosition(formData: FormData) {
  await requirePermission("create_positions")

  let code = (formData.get("code") as string) || null
  if (!code) {
    code = await generateDocumentNumber("POS", "simple")
  }

  const position = await prisma.position.create({
    data: {
      name: formData.get("name") as string,
      code,
      departmentId: safeId(formData.get("departmentId")),
    },
  })

  revalidatePath("/master/employees")
  return { success: true, id: position.id }
}

export async function updatePosition(id: number, formData: FormData) {
  await requirePermission("edit_positions")

  await prisma.position.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      departmentId: safeId(formData.get("departmentId")),
    },
  })

  revalidatePath("/master/positions")
  return { success: true }
}

export async function createLead(formData: FormData) {
  await requirePermission("create_leads")

  const leadNumber = await generateDocumentNumber("LEAD", "simple")

  const data = {
    leadNumber,
    name: formData.get("name") as string,
    email: formData.get("email") as string || null,
    phone: formData.get("phone") as string || null,
    company: formData.get("company") as string || null,
    contactName: formData.get("contactName") as string || null,
    position: formData.get("position") as string || null,
    industry: formData.get("industry") as string || null,
    estimatedValue: safeNumber(formData.get("estimatedValue")),
    expectedCloseDate: formData.get("expectedCloseDate") ? new Date(formData.get("expectedCloseDate") as string) : null,
    address: formData.get("address") as string || null,
    source: formData.get("source") as string || null,
    notes: formData.get("notes") as string || null,
    assignedTo: safeId(formData.get("assignedTo")),
    status: "new",
  }

  await prisma.lead.create({ data })
  revalidatePath("/crm/leads")
  return { success: true }
}

export async function updateLead(id: number, formData: FormData) {
  await requirePermission("edit_leads")

  await prisma.lead.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      email: formData.get("email") as string || null,
      phone: formData.get("phone") as string || null,
      company: formData.get("company") as string || null,
      contactName: formData.get("contactName") as string || null,
      position: formData.get("position") as string || null,
      industry: formData.get("industry") as string || null,
      estimatedValue: safeNumber(formData.get("estimatedValue")),
      expectedCloseDate: formData.get("expectedCloseDate") ? new Date(formData.get("expectedCloseDate") as string) : null,
      address: formData.get("address") as string || null,
      source: formData.get("source") as string || null,
      notes: formData.get("notes") as string || null,
      assignedTo: safeId(formData.get("assignedTo")),
    },
  })

  revalidatePath("/crm/leads")
  return { success: true }
}

// ==================== BANK ACTIONS ====================

export async function createBank(formData: FormData) {
  await requirePermission("create_banks")

  const bank = await prisma.bank.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      accountId: safeId(formData.get("accountId")),
      isActive: true,
    },
  })

  revalidatePath("/master/banks")
  return { success: true, id: bank.id }
}

export async function updateBank(id: number, formData: FormData) {
  await requirePermission("edit_banks")

  await prisma.bank.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      accountId: safeId(formData.get("accountId")),
    },
  })

  revalidatePath("/master/banks")
  return { success: true }
}

// ==================== TAX ACTIONS ====================

export async function createTax(formData: FormData) {
  await requirePermission("create_taxes")

  const tax = await prisma.tax.create({
    data: {
      name: formData.get("name") as string,
      rate: (safeNumber(formData.get("rate")) ?? 0),
      code: (formData.get("code") as string) || undefined,
      description: (formData.get("description") as string) || undefined,
      type: (formData.get("type") as string) || undefined,
      scope: (formData.get("scope") as string) || undefined,
      isInclusive: formData.get("isInclusive") === "on",
      isCompound: formData.get("isCompound") === "on",
      effectiveFrom: formData.get("effectiveFrom") ? new Date(formData.get("effectiveFrom") as string) : undefined,
      effectiveTo: formData.get("effectiveTo") ? new Date(formData.get("effectiveTo") as string) : undefined,
      isActive: true,
    },
  })

  revalidatePath("/master/taxes")
  return { success: true, id: tax.id }
}

export async function updateTax(id: number, formData: FormData) {
  await requirePermission("edit_taxes")

  await prisma.tax.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      rate: (safeNumber(formData.get("rate")) ?? 0),
      code: (formData.get("code") as string) || undefined,
      description: (formData.get("description") as string) || undefined,
      type: (formData.get("type") as string) || undefined,
      scope: (formData.get("scope") as string) || undefined,
      isInclusive: formData.get("isInclusive") === "on",
      isCompound: formData.get("isCompound") === "on",
      effectiveFrom: formData.get("effectiveFrom") ? new Date(formData.get("effectiveFrom") as string) : undefined,
      effectiveTo: formData.get("effectiveTo") ? new Date(formData.get("effectiveTo") as string) : undefined,
    },
  })

  revalidatePath("/master/taxes")
  return { success: true }
}

// ==================== PRICE LIST ACTIONS ====================

export async function createPriceList(formData: FormData) {
  await requirePermission("create_items")

  const priceList = await prisma.priceList.create({
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      isActive: true,
    },
  })

  revalidatePath("/master/price-lists")
  return { success: true, id: priceList.id }
}

// ==================== CURRENCY ACTIONS ====================

export async function createCurrency(formData: FormData) {
  await requirePermission("create_items")

  const currency = await prisma.currency.create({
    data: {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      rate: (safeNumber(formData.get("rate")) ?? 0),
      symbol: (formData.get("symbol") as string) || undefined,
      symbolPosition: (formData.get("symbolPosition") as string) || undefined,
      decimalSeparator: (formData.get("decimalSeparator") as string) || undefined,
      thousandsSeparator: (formData.get("thousandsSeparator") as string) || undefined,
      decimalPlaces: safeNumber(formData.get("decimalPlaces")) ?? undefined,
      isBase: formData.get("isBase") === "on",
      isActive: true,
    },
  })

  revalidatePath("/master/currencies")
  return { success: true, id: currency.id }
}

export async function updateCurrency(id: number, formData: FormData) {
  await requirePermission("edit_items")

  await prisma.currency.update({
    where: { id },
    data: {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      rate: (safeNumber(formData.get("rate")) ?? 0),
      symbol: (formData.get("symbol") as string) || undefined,
      symbolPosition: (formData.get("symbolPosition") as string) || undefined,
      decimalSeparator: (formData.get("decimalSeparator") as string) || undefined,
      thousandsSeparator: (formData.get("thousandsSeparator") as string) || undefined,
      decimalPlaces: safeNumber(formData.get("decimalPlaces")) ?? undefined,
      isBase: formData.get("isBase") === "on",
    },
  })

  revalidatePath("/master/currencies")
  return { success: true }
}

// ==================== BARCODE ACTIONS ====================

export async function createBarcode(formData: FormData) {
  await requirePermission("create_items")

  const barcodeEntry = await prisma.barcode.create({
    data: {
      barcode: formData.get("barcode") as string,
      itemId: requireNumber(formData.get("itemId"), "itemId"),
      type: (formData.get("type") as string) || "EAN13",
    },
  })

  revalidatePath("/master/barcodes")
  return { success: true, id: barcodeEntry.id }
}

// ==================== TAX GROUP ACTIONS ====================

export async function createTaxGroup(formData: FormData) {
  await requirePermission("create_taxes")

  const name = formData.get("name") as string
  const taxIds = formData.getAll("taxIds").map((id) => Number(id))

  const taxGroup = await prisma.taxGroup.create({
    data: {
      name,
      taxes: {
        create: taxIds.map((taxId) => ({ taxId })),
      },
    },
  })

  revalidatePath("/master/tax-groups")
  return { success: true, id: taxGroup.id }
}

// ==================== STATISTICAL KEY FIGURE ACTIONS ====================

export async function createStatisticalKeyFigure(formData: FormData) {
  await requirePermission("create_accounts")

  const figure = await prisma.statisticalKeyFigure.create({
    data: {
      name: formData.get("name") as string,
      unit: formData.get("unit") as string,
      value: (safeNumber(formData.get("value")) ?? 0),
    },
  })

  revalidatePath("/finance/statistical-key-figures")
  return { success: true, id: figure.id }
}

// ==================== PAYMENT TERM ACTIONS ====================

export async function createPaymentTerm(formData: FormData) {
  await requirePermission("create_items")

  const paymentTerm = await prisma.paymentTerm.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      days: (safeNumber(formData.get("days")) ?? 0),
      isActive: true,
    },
  })

  revalidatePath("/master/payment-terms")
  return { success: true, id: paymentTerm.id }
}

export async function updatePaymentTerm(id: number, formData: FormData) {
  await requirePermission("edit_items")

  await prisma.paymentTerm.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      days: (safeNumber(formData.get("days")) ?? 0),
    },
  })

  revalidatePath("/master/payment-terms")
  return { success: true }
}

export async function deletePaymentTerm(id: number) {
  await requirePermission("delete_items")

  await prisma.paymentTerm.delete({ where: { id } })

  revalidatePath("/master/payment-terms")
  return { success: true }
}

// ==================== DELETE ACTIONS ====================

export async function deleteVendor(id: number) {
  await requirePermission("delete_vendors")

  await prisma.vendor.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/vendors")
  return { success: true }
}

export async function deleteItem(id: number) {
  await requirePermission("delete_items")

  await prisma.item.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/items")
  return { success: true }
}

export async function deleteWarehouse(id: number) {
  await requirePermission("delete_warehouses")

  await prisma.warehouse.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/warehouses")
  return { success: true }
}

export async function deleteEmployee(id: number) {
  await requirePermission("delete_employees")

  await prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/employees")
  return { success: true }
}

export async function deleteDepartment(id: number) {
  await requirePermission("delete_departments")

  await prisma.department.delete({ where: { id } })

  revalidatePath("/master/employees")
  return { success: true }
}

export async function deletePosition(id: number) {
  await requirePermission("delete_positions")

  await prisma.position.delete({ where: { id } })

  revalidatePath("/master/employees")
  return { success: true }
}

export async function deleteBank(id: number) {
  await requirePermission("delete_banks")

  await prisma.bank.delete({ where: { id } })

  revalidatePath("/master/banks")
  return { success: true }
}

export async function deleteTax(id: number) {
  await requirePermission("delete_taxes")

  await prisma.tax.delete({ where: { id } })

  revalidatePath("/master/taxes")
  return { success: true }
}

export async function deleteTaxGroup(id: number) {
  await requirePermission("delete_taxes")

  await prisma.taxGroup.delete({ where: { id } })

  revalidatePath("/master/tax-groups")
  return { success: true }
}

export async function deleteCurrency(id: number) {
  await requirePermission("delete_items")

  await prisma.currency.delete({ where: { id } })

  revalidatePath("/master/currencies")
  return { success: true }
}

export async function deletePriceList(id: number) {
  await requirePermission("delete_items")

  await prisma.priceList.delete({ where: { id } })

  revalidatePath("/master/price-lists")
  return { success: true }
}

export async function deleteBarcode(id: number) {
  await requirePermission("delete_items")

  await prisma.barcode.delete({ where: { id } })

  revalidatePath("/master/barcodes")
  return { success: true }
}

export async function deleteItemCategory(id: number) {
  await requirePermission("delete_item_categories")

  await prisma.itemCategory.delete({ where: { id } })

  revalidatePath("/master/items")
  return { success: true }
}


export async function updateAccount(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_accounts")

  let code = (formData.get("code") as string) || null
  if (!code) {
    code = await generateDocumentNumber("ACC", "simple")
  }

  const account = await prisma.account.update({
    where: { id },
    data: {
      code,
      name: formData.get("name") as string,
      type: formData.get("type") as "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE",
      parentId: safeNumber(formData.get("parentId")),
      isActive: true,
    },
  })

  revalidatePath("/master/accounts")
  return { success: true, id: account.id }
}

// ==================== BRAND ACTIONS ====================

export async function createBrand(formData: FormData) {
  await requirePermission("create_items")

  const brand = await prisma.brand.create({
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/master/brands")
  return { success: true, id: brand.id }
}

export async function updateBrand(id: number, formData: FormData) {
  await requirePermission("edit_items")

  await prisma.brand.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/master/brands")
  return { success: true }
}

export async function deleteBrand(id: number) {
  await requirePermission("delete_items")

  await prisma.brand.delete({ where: { id } })

  revalidatePath("/master/brands")
  return { success: true }
}