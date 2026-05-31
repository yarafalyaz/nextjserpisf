"use server"

import { requireAuth, requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"

// ==================== CUSTOMER ACTIONS ====================

export async function createCustomer(formData: FormData) {
  try {
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

  revalidatePath("/master/pelanggan")
  return { success: true, id: customer.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createCustomer]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateCustomer(customerId: number, formData: FormData) {
  try {
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

  revalidatePath("/master/pelanggan")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateCustomer]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteCustomer(customerId: number) {
  try {
  await requirePermission("delete_customers")

  await prisma.customer.update({
    where: { id: customerId },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/pelanggan")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteCustomer]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== VENDOR ACTIONS ====================

export async function createVendor(formData: FormData) {
  try {
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

  revalidatePath("/master/pemasok")
  return { success: true, id: vendor.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createVendor]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateVendor(vendorId: number, formData: FormData) {
  try {
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

  revalidatePath("/master/pemasok")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateVendor]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== ITEM ACTIONS ====================

export async function createItem(formData: FormData) {
  try {
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

  revalidatePath("/master/barang")
  return { success: true, id: item.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createItem]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateItem(itemId: number, formData: FormData) {
  try {
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

  revalidatePath("/master/barang")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateItem]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== WAREHOUSE ACTIONS ====================

export async function createWarehouse(formData: FormData) {
  try {
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

  revalidatePath("/master/gudang")
  return { success: true, id: warehouse.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createWarehouse]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateWarehouse(warehouseId: number, formData: FormData) {
  try {
  await requirePermission("edit_warehouses")

  await prisma.warehouse.update({
    where: { id: warehouseId },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      address: formData.get("address") as string | null,
    },
  })

  revalidatePath("/master/gudang")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateWarehouse]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== EMPLOYEE ACTIONS ====================

export async function createEmployee(formData: FormData) {
  try {
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

  revalidatePath("/master/karyawan")
  return { success: true, id: employee.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createEmployee]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateEmployee(employeeId: number, formData: FormData) {
  try {
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

  revalidatePath("/master/karyawan")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateEmployee]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== ACCOUNT (COA) ACTIONS ====================

export async function createAccount(formData: FormData) {
  try {
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

  revalidatePath("/master/akun")
  return { success: true, id: account.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createAccount]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== ITEM CATEGORY ACTIONS ====================

export async function createItemCategory(formData: FormData) {
  try {
  await requirePermission("create_item_categories")

  const category = await prisma.itemCategory.create({
    data: {
      name: formData.get("name") as string,
      description: formData.get("description") as string | null,
      parentId: safeNumber(formData.get("parentId")),
    },
  })

  revalidatePath("/master/barang")
  return { success: true, id: category.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createItemCategory]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateItemCategory(id: number, formData: FormData) {
  try {
  await requirePermission("edit_item_categories")

  await prisma.itemCategory.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      description: formData.get("description") as string | null,
      parentId: safeNumber(formData.get("parentId")),
    },
  })

  revalidatePath("/master/kategori-barang")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateItemCategory]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== DEPARTMENT ACTIONS ====================

export async function createDepartment(formData: FormData) {
  try {
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

  revalidatePath("/master/karyawan")
  return { success: true, id: department.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createDepartment]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateDepartment(id: number, formData: FormData) {
  try {
  await requirePermission("edit_departments")

  await prisma.department.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string | null,
      description: formData.get("description") as string | null,
    },
  })

  revalidatePath("/master/departemen")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateDepartment]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== POSITION ACTIONS ====================

export async function createPosition(formData: FormData) {
  try {
  await requirePermission("create_positions")

  const submittedCode = (formData.get("code") as string) || null
  let code = submittedCode

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!code) {
      code = await generateDocumentNumber("POS", "simple")
    }

    try {
      const position = await prisma.position.create({
        data: {
          name: formData.get("name") as string,
          code,
          departmentId: safeId(formData.get("departmentId")),
        },
      })

      revalidatePath("/master/karyawan")
      return { success: true, id: position.id }
    } catch (createErr: any) {
      const isUniqueCodeConflict = createErr?.code === "P2002" && (
        (Array.isArray(createErr?.meta?.target) && createErr.meta.target.includes("code")) ||
        String(createErr?.message || "").includes("positions_code_key")
      )
      if (!isUniqueCodeConflict) throw createErr
      code = null
    }
  }

  return { success: false, error: "Gagal membuat kode jabatan unik, silakan coba lagi" }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createPosition]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updatePosition(id: number, formData: FormData) {
  try {
  await requirePermission("edit_positions")

  await prisma.position.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      departmentId: safeId(formData.get("departmentId")),
    },
  })

  revalidatePath("/master/jabatan")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updatePosition]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function createLead(formData: FormData) {
  try {
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

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createLead]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateLead(id: number, formData: FormData) {
  try {
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

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateLead]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== BANK ACTIONS ====================

export async function createBank(formData: FormData) {
  try {
  await requirePermission("create_banks")

  const bank = await prisma.bank.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      accountId: safeId(formData.get("accountId")),
      isActive: true,
    },
  })

  revalidatePath("/master/bank")
  return { success: true, id: bank.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createBank]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateBank(id: number, formData: FormData) {
  try {
  await requirePermission("edit_banks")

  await prisma.bank.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      accountId: safeId(formData.get("accountId")),
    },
  })

  revalidatePath("/master/bank")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateBank]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== TAX ACTIONS ====================

export async function createTax(formData: FormData) {
  try {
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

  revalidatePath("/master/pajak")
  return { success: true, id: tax.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createTax]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateTax(id: number, formData: FormData) {
  try {
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

  revalidatePath("/master/pajak")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateTax]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== PRICE LIST ACTIONS ====================

export async function createPriceList(formData: FormData) {
  try {
  await requirePermission("create_items")

  const priceList = await prisma.priceList.create({
    data: {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
      isActive: true,
    },
  })

  revalidatePath("/master/daftar-harga")
  return { success: true, id: priceList.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createPriceList]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== CURRENCY ACTIONS ====================

export async function createCurrency(formData: FormData) {
  try {
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

  revalidatePath("/master/mata-uang")
  return { success: true, id: currency.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createCurrency]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateCurrency(id: number, formData: FormData) {
  try {
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

  revalidatePath("/master/mata-uang")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateCurrency]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== BARCODE ACTIONS ====================

export async function createBarcode(formData: FormData) {
  try {
  await requirePermission("create_items")

  const barcodeEntry = await prisma.barcode.create({
    data: {
      barcode: formData.get("barcode") as string,
      itemId: requireNumber(formData.get("itemId"), "itemId"),
      type: (formData.get("type") as string) || "EAN13",
    },
  })

  revalidatePath("/master/barcode")
  return { success: true, id: barcodeEntry.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createBarcode]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== TAX GROUP ACTIONS ====================

export async function createTaxGroup(formData: FormData) {
  try {
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

  revalidatePath("/master/kelompok-pajak")
  return { success: true, id: taxGroup.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createTaxGroup]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== STATISTICAL KEY FIGURE ACTIONS ====================

export async function createStatisticalKeyFigure(formData: FormData) {
  try {
  await requirePermission("create_accounts")

  const figure = await prisma.statisticalKeyFigure.create({
    data: {
      name: formData.get("name") as string,
      unit: formData.get("unit") as string,
      value: (safeNumber(formData.get("value")) ?? 0),
    },
  })

  revalidatePath("/keuangan/angka-kunci-statistik")
  return { success: true, id: figure.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createStatisticalKeyFigure]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== PAYMENT TERM ACTIONS ====================

export async function createPaymentTerm(formData: FormData) {
  try {
  await requirePermission("create_items")

  const paymentTerm = await prisma.paymentTerm.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      days: (safeNumber(formData.get("days")) ?? 0),
      isActive: true,
    },
  })

  revalidatePath("/master/syarat-pembayaran")
  return { success: true, id: paymentTerm.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createPaymentTerm]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updatePaymentTerm(id: number, formData: FormData) {
  try {
  await requirePermission("edit_items")

  await prisma.paymentTerm.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      days: (safeNumber(formData.get("days")) ?? 0),
    },
  })

  revalidatePath("/master/syarat-pembayaran")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updatePaymentTerm]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deletePaymentTerm(id: number) {
  try {
  await requirePermission("delete_items")

  await prisma.paymentTerm.delete({ where: { id } })

  revalidatePath("/master/syarat-pembayaran")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deletePaymentTerm]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteVendor(id: number) {
  try {
  await requirePermission("delete_vendors")

  await prisma.vendor.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/pemasok")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteVendor]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteItem(id: number) {
  try {
  await requirePermission("delete_items")

  await prisma.item.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/barang")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteItem]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteWarehouse(id: number) {
  try {
  await requirePermission("delete_warehouses")

  await prisma.warehouse.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/gudang")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteWarehouse]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteEmployee(id: number) {
  try {
  await requirePermission("delete_employees")

  await prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  revalidatePath("/master/karyawan")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteEmployee]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteDepartment(id: number) {
  try {
  await requirePermission("delete_departments")

  await prisma.department.delete({ where: { id } })

  revalidatePath("/master/karyawan")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteDepartment]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deletePosition(id: number) {
  try {
  await requirePermission("delete_positions")

  await prisma.position.delete({ where: { id } })

  revalidatePath("/master/karyawan")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deletePosition]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteBank(id: number) {
  try {
  await requirePermission("delete_banks")

  await prisma.bank.delete({ where: { id } })

  revalidatePath("/master/bank")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteBank]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteTax(id: number) {
  try {
  await requirePermission("delete_taxes")

  await prisma.tax.delete({ where: { id } })

  revalidatePath("/master/pajak")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteTax]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteTaxGroup(id: number) {
  try {
  await requirePermission("delete_taxes")

  await prisma.taxGroup.delete({ where: { id } })

  revalidatePath("/master/kelompok-pajak")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteTaxGroup]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteCurrency(id: number) {
  try {
  await requirePermission("delete_items")

  await prisma.currency.delete({ where: { id } })

  revalidatePath("/master/mata-uang")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteCurrency]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deletePriceList(id: number) {
  try {
  await requirePermission("delete_items")

  await prisma.priceList.delete({ where: { id } })

  revalidatePath("/master/daftar-harga")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deletePriceList]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteBarcode(id: number) {
  try {
  await requirePermission("delete_items")

  await prisma.barcode.delete({ where: { id } })

  revalidatePath("/master/barcode")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteBarcode]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteItemCategory(id: number) {
  try {
  await requirePermission("delete_item_categories")

  await prisma.itemCategory.delete({ where: { id } })

  revalidatePath("/master/barang")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteItemCategory]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}


export async function updateAccount(id: number, formData: FormData) {
  try {
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

  revalidatePath("/master/akun")
  return { success: true, id: account.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateAccount]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

// ==================== BRAND ACTIONS ====================

export async function createBrand(formData: FormData) {
  try {
  await requirePermission("create_items")

  const brand = await prisma.brand.create({
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/master/merek")
  return { success: true, id: brand.id }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[createBrand]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function updateBrand(id: number, formData: FormData) {
  try {
  await requirePermission("edit_items")

  await prisma.brand.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/master/merek")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[updateBrand]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}

export async function deleteBrand(id: number) {
  try {
  await requirePermission("delete_items")

  await prisma.brand.delete({ where: { id } })

  revalidatePath("/master/merek")
  return { success: true }

  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e
    console.error("[deleteBrand]", e?.message || e)
    return { success: false, error: e?.message || "Terjadi kesalahan" }
  }
}