/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"
import { logActivity } from "@/lib/services/activity-log.service"

/**
 * Smart delete for master records that carry a `deletedAt` soft-delete column.
 * Attempts a HARD delete first; if the row is still referenced by other records
 * the database raises a foreign-key violation (P2003), in which case we fall
 * back to a SOFT delete to preserve those historical references.
 *
 * This keeps the table free of cruft for never-used masters (so generated codes
 * reflect reality and an empty list yields PREFIX-0001) while protecting
 * referential integrity for masters tied to transactions.
 *
 * Safe by schema design: no transaction->master relation uses onDelete: Cascade,
 * so a hard delete can never wipe transactional data — it is always Restricted
 * (or SetNull for nullable, non-historical links such as Task.assignedTo).
 */
async function hardDeleteOrSoftDelete(
  hardDelete: () => Promise<unknown>,
  softDelete: () => Promise<unknown>,
): Promise<void> {
  try {
    await hardDelete()
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      await softDelete()
      return
    }
    throw e
  }
}

// ==================== CUSTOMER ACTIONS ====================

export async function createCustomer(formData: FormData) {
  try {
  await requirePermission("create_customers")

  const settings = await getSystemSettings()
  let code = (formData.get("code") as string) || null
  if (settings.enableAutoCustomerCode !== false || !code) {
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
      creditLimit: safeNumber(formData.get("creditLimit")) ?? 0,
      isActive: true,
    },
  })

  revalidatePath("/master/pelanggan")
  await logActivity("create", "Customer", customer.id, "Membuat pelanggan")
  return { success: true, id: customer.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createCustomer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
      creditLimit: safeNumber(formData.get("creditLimit")) ?? 0,
    },
  })

  revalidatePath("/master/pelanggan")
  await logActivity("update", "Customer", customerId, "Memperbarui pelanggan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateCustomer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteCustomer(customerId: number) {
  try {
  await requirePermission("delete_customers")

  await hardDeleteOrSoftDelete(
    () => prisma.customer.delete({ where: { id: customerId } }),
    () => prisma.customer.update({ where: { id: customerId }, data: { deletedAt: new Date() } }),
  )

  revalidatePath("/master/pelanggan")
  await logActivity("delete", "Customer", customerId, "Menghapus pelanggan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteCustomer]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== VENDOR ACTIONS ====================

export async function createVendor(formData: FormData) {
  try {
  await requirePermission("create_vendors")

  await requirePermission("create_vendors")

  const settings = await getSystemSettings()
  let code = (formData.get("code") as string) || null
  if (settings.enableAutoVendorCode !== false || !code) {
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
  await logActivity("create", "Vendor", vendor.id, "Membuat pemasok")
  return { success: true, id: vendor.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createVendor]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "Vendor", vendorId, "Memperbarui pemasok")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateVendor]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== ITEM ACTIONS ====================

export async function createItem(formData: FormData) {
  try {
  await requirePermission("create_items")

  const itemSettings = await getSystemSettings()
  let sku = (formData.get("sku") as string) || null
  if (itemSettings.enableAutoItemCode !== false || !sku) {
    sku = await generateDocumentNumber("ITM", "simple")
  }

  const itemCost = safeNumber(formData.get("cost")) ?? 0
  const itemPrice = safeNumber(formData.get("price")) ?? 0
  if (itemPrice < itemCost) {
    return { success: false, error: "Harga jual tidak boleh lebih rendah dari harga beli (modal)." }
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
      cost: itemCost,
      price: itemPrice,
      standardCost: safeNumber(formData.get("standardCost")) ?? undefined,
      costingMethod: (formData.get("costingMethod") as string) || undefined,
      purchasePrice: safeNumber(formData.get("purchasePrice")) ?? undefined,
      isProduct: formData.get("isProduct") === "true",
      trackBatch: formData.get("trackBatch") === "true",
      trackSerial: formData.get("trackSerial") === "true",
      isActive: true,
    },
  })

  // Multi-UoM alternate unit conversions (JSON: [{ code, factorToBase }])
  const convJson = formData.get("uomConversions") as string | null
  const conversions = (safeJsonParse<{ code: string; factorToBase: number }[]>(convJson) ?? [])
    .filter((c) => c.code?.trim() && Number(c.factorToBase) > 0)
  if (conversions.length > 0) {
    await prisma.uomConversion.createMany({
      data: conversions.map((c) => ({ itemId: item.id, code: c.code.trim(), factorToBase: Number(c.factorToBase) })),
      skipDuplicates: true,
    })
  }

  revalidatePath("/master/barang")
  await logActivity("create", "Item", item.id, "Membuat barang")
  return { success: true, id: item.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createItem]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateItem(itemId: number, formData: FormData) {
  try {
  await requirePermission("edit_items")

  const updItemCost = safeNumber(formData.get("cost")) ?? 0
  const updItemPrice = safeNumber(formData.get("price")) ?? 0
  if (updItemPrice < updItemCost) {
    return { success: false, error: "Harga jual tidak boleh lebih rendah dari harga beli (modal)." }
  }

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
      cost: updItemCost,
      price: updItemPrice,
      standardCost: safeNumber(formData.get("standardCost")) ?? undefined,
      costingMethod: (formData.get("costingMethod") as string) || undefined,
      purchasePrice: safeNumber(formData.get("purchasePrice")) ?? undefined,
      isProduct: formData.get("isProduct") === "true",
      trackBatch: formData.get("trackBatch") === "true",
      trackSerial: formData.get("trackSerial") === "true",
    },
  })

  // Replace alternate-unit conversions
  const convJson = formData.get("uomConversions") as string | null
  if (convJson !== null) {
    const conversions = (safeJsonParse<{ code: string; factorToBase: number }[]>(convJson) ?? [])
      .filter((c) => c.code?.trim() && Number(c.factorToBase) > 0)
    await prisma.uomConversion.deleteMany({ where: { itemId } })
    if (conversions.length > 0) {
      await prisma.uomConversion.createMany({
        data: conversions.map((c) => ({ itemId, code: c.code.trim(), factorToBase: Number(c.factorToBase) })),
        skipDuplicates: true,
      })
    }
  }

  revalidatePath("/master/barang")
  await logActivity("update", "Item", itemId, "Memperbarui barang")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateItem]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== WAREHOUSE ACTIONS ====================

export async function createWarehouse(formData: FormData) {
  try {
  await requirePermission("create_warehouses")

  const settings = await getSystemSettings()
  let code = (formData.get("code") as string) || null
  if (settings.enableAutoWarehouseCode !== false || !code) {
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
  await logActivity("create", "Warehouse", warehouse.id, "Membuat gudang")
  return { success: true, id: warehouse.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createWarehouse]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "Warehouse", warehouseId, "Memperbarui gudang")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateWarehouse]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== EMPLOYEE ACTIONS ====================

export async function createEmployee(formData: FormData) {
  try {
  await requirePermission("create_employees")

  const settings = await getSystemSettings()
  let employeeNo = (formData.get("employeeNo") as string) || null
  if (settings.enableAutoEmployeeCode !== false || !employeeNo) {
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
  await logActivity("create", "Employee", employee.id, "Membuat karyawan")
  return { success: true, id: employee.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createEmployee]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "Employee", employeeId, "Memperbarui karyawan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateEmployee]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("create", "Account", account.id, "Membuat akun")
  return { success: true, id: account.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createAccount]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("create", "ItemCategory", category.id, "Membuat kategori barang")
  return { success: true, id: category.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createItemCategory]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "ItemCategory", id, "Memperbarui kategori barang")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateItemCategory]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("create", "Department", department.id, "Membuat departemen")
  return { success: true, id: department.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createDepartment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "Department", id, "Memperbarui departemen")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateDepartment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
      await logActivity("create", "Position", position.id, "Membuat jabatan")
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

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createPosition]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "Position", id, "Memperbarui jabatan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePosition]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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

  const lead = await prisma.lead.create({ data })
  revalidatePath("/crm/leads")
  await logActivity("create", "Lead", lead.id, "Membuat lead")
  redirect("/crm/leads")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createLead]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "Lead", id, "Memperbarui lead")
  redirect("/crm/leads")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateLead]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("create", "Bank", bank.id, "Membuat bank")
  return { success: true, id: bank.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createBank]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "Bank", id, "Memperbarui bank")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateBank]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("create", "Tax", tax.id, "Membuat pajak")
  redirect("/master/pajak")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createTax]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("update", "Tax", id, "Memperbarui pajak")
  redirect("/master/pajak")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateTax]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== CURRENCY ACTIONS ====================

export async function createCurrency(formData: FormData) {
  try {
  await requirePermission("create_currencies")

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
  await logActivity("create", "Currency", currency.id, "Membuat mata uang")
  return { success: true, id: currency.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createCurrency]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateCurrency(id: number, formData: FormData) {
  try {
  await requirePermission("edit_currencies")

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
  await logActivity("update", "Currency", id, "Memperbarui mata uang")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateCurrency]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== BARCODE ACTIONS ====================

/**
 * Resolve a scanned/typed code (barcode OR SKU) to an item id.
 * Used by the scan page to jump straight to the item's tracking detail.
 */
export async function lookupItemByScan(rawCode: string): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    await requirePermission("view_items")
    const code = (rawCode || "").trim()
    if (!code) return { success: false, error: "Kode kosong" }

    const byBarcode = await prisma.barcode.findUnique({ where: { barcode: code }, select: { itemId: true } })
    if (byBarcode) return { success: true, id: byBarcode.itemId }

    const bySku = await prisma.item.findFirst({
      where: { sku: code, deletedAt: null },
      select: { id: true },
    })
    if (bySku) return { success: true, id: bySku.id }

    return { success: false, error: `Barang dengan kode "${code}" tidak ditemukan` }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[lookupItemByScan]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function createBarcode(formData: FormData) {
  try {
  await requirePermission("create_barcodes")

  const barcodeEntry = await prisma.barcode.create({
    data: {
      barcode: formData.get("barcode") as string,
      itemId: requireNumber(formData.get("itemId"), "itemId"),
      type: (formData.get("type") as string) || "EAN13",
    },
  })

  revalidatePath("/master/barcode")
  await logActivity("create", "Barcode", barcodeEntry.id, "Membuat barcode")
  return { success: true, id: barcodeEntry.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createBarcode]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateBarcode(id: number, formData: FormData) {
  try {
    await requirePermission("edit_barcodes")
    await prisma.barcode.update({
      where: { id },
      data: {
        barcode: formData.get("barcode") as string,
        itemId: requireNumber(formData.get("itemId"), "itemId"),
        type: (formData.get("type") as string) || "EAN13",
      },
    })
    revalidatePath("/master/barcode")
    await logActivity("update", "Barcode", id, "Memperbarui barcode")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateBarcode]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("create", "TaxGroup", taxGroup.id, "Membuat kelompok pajak")
  return { success: true, id: taxGroup.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createTaxGroup]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateTaxGroup(id: number, formData: FormData) {
  try {
    await requirePermission("edit_taxes")
    const name = formData.get("name") as string
    const taxIds = formData.getAll("taxIds").map((t) => Number(t))
    await prisma.$transaction([
      prisma.taxGroupTax.deleteMany({ where: { taxGroupId: id } }),
      prisma.taxGroup.update({
        where: { id },
        data: {
          name,
          taxes: { create: taxIds.map((taxId) => ({ taxId })) },
        },
      }),
    ])
    revalidatePath("/master/kelompok-pajak")
    await logActivity("update", "TaxGroup", id, "Memperbarui kelompok pajak")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateTaxGroup]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
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
  await logActivity("create", "StatisticalKeyFigure", figure.id, "Membuat angka kunci statistik")
  return { success: true, id: figure.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createStatisticalKeyFigure]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateStatisticalKeyFigure(id: number, formData: FormData) {
  try {
    await requirePermission("edit_accounts")
    await prisma.statisticalKeyFigure.update({
      where: { id },
      data: {
        name: formData.get("name") as string,
        unit: formData.get("unit") as string,
        value: (safeNumber(formData.get("value")) ?? 0),
      },
    })
    revalidatePath("/keuangan/angka-kunci-statistik")
    await logActivity("update", "StatisticalKeyFigure", id, "Memperbarui angka kunci statistik")
    return { success: true }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateStatisticalKeyFigure]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PAYMENT TERM ACTIONS ====================

export async function createPaymentTerm(formData: FormData) {
  try {
  await requirePermission("create_payment_terms")

  const paymentTerm = await prisma.paymentTerm.create({
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      days: (safeNumber(formData.get("days")) ?? 0),
      isActive: true,
    },
  })

  revalidatePath("/master/syarat-pembayaran")
  await logActivity("create", "PaymentTerm", paymentTerm.id, "Membuat syarat pembayaran")
  return { success: true, id: paymentTerm.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createPaymentTerm]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updatePaymentTerm(id: number, formData: FormData) {
  try {
  await requirePermission("edit_payment_terms")

  await prisma.paymentTerm.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      code: formData.get("code") as string,
      days: (safeNumber(formData.get("days")) ?? 0),
    },
  })

  revalidatePath("/master/syarat-pembayaran")
  await logActivity("update", "PaymentTerm", id, "Memperbarui syarat pembayaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePaymentTerm]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deletePaymentTerm(id: number) {
  try {
  await requirePermission("delete_payment_terms")

  await prisma.paymentTerm.delete({ where: { id } })

  revalidatePath("/master/syarat-pembayaran")
  await logActivity("delete", "PaymentTerm", id, "Menghapus syarat pembayaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePaymentTerm]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteVendor(id: number) {
  try {
  await requirePermission("delete_vendors")

  await hardDeleteOrSoftDelete(
    () => prisma.vendor.delete({ where: { id } }),
    () => prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } }),
  )

  revalidatePath("/master/pemasok")
  await logActivity("delete", "Vendor", id, "Menghapus pemasok")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteVendor]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteItem(id: number) {
  try {
  await requirePermission("delete_items")

  await hardDeleteOrSoftDelete(
    () => prisma.item.delete({ where: { id } }),
    () => prisma.item.update({ where: { id }, data: { deletedAt: new Date() } }),
  )

  revalidatePath("/master/barang")
  await logActivity("delete", "Item", id, "Menghapus barang")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteItem]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteWarehouse(id: number) {
  try {
  await requirePermission("delete_warehouses")

  await hardDeleteOrSoftDelete(
    () => prisma.warehouse.delete({ where: { id } }),
    () => prisma.warehouse.update({ where: { id }, data: { deletedAt: new Date() } }),
  )

  revalidatePath("/master/gudang")
  await logActivity("delete", "Warehouse", id, "Menghapus gudang")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteWarehouse]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteEmployee(id: number) {
  try {
  await requirePermission("delete_employees")

  await hardDeleteOrSoftDelete(
    () => prisma.employee.delete({ where: { id } }),
    () => prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } }),
  )

  revalidatePath("/master/karyawan")
  await logActivity("delete", "Employee", id, "Menghapus karyawan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteEmployee]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteDepartment(id: number) {
  try {
  await requirePermission("delete_departments")

  await prisma.department.delete({ where: { id } })

  revalidatePath("/master/karyawan")
  await logActivity("delete", "Department", id, "Menghapus departemen")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteDepartment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deletePosition(id: number) {
  try {
  await requirePermission("delete_positions")

  await prisma.position.delete({ where: { id } })

  revalidatePath("/master/karyawan")
  await logActivity("delete", "Position", id, "Menghapus jabatan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deletePosition]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteBank(id: number) {
  try {
  await requirePermission("delete_banks")

  await prisma.bank.delete({ where: { id } })

  revalidatePath("/master/bank")
  await logActivity("delete", "Bank", id, "Menghapus bank")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteBank]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteTax(id: number) {
  try {
  await requirePermission("delete_taxes")

  await prisma.tax.delete({ where: { id } })

  revalidatePath("/master/pajak")
  await logActivity("delete", "Tax", id, "Menghapus pajak")
  redirect("/master/pajak")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteTax]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteTaxGroup(id: number) {
  try {
  await requirePermission("delete_taxes")

  await prisma.taxGroup.delete({ where: { id } })

  revalidatePath("/master/kelompok-pajak")
  await logActivity("delete", "TaxGroup", id, "Menghapus kelompok pajak")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteTaxGroup]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteCurrency(id: number) {
  try {
  await requirePermission("delete_currencies")

  await prisma.currency.delete({ where: { id } })

  revalidatePath("/master/mata-uang")
  await logActivity("delete", "Currency", id, "Menghapus mata uang")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteCurrency]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteBarcode(id: number) {
  try {
  await requirePermission("delete_barcodes")

  await prisma.barcode.delete({ where: { id } })

  revalidatePath("/master/barcode")
  await logActivity("delete", "Barcode", id, "Menghapus barcode")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteBarcode]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteItemCategory(id: number) {
  try {
  await requirePermission("delete_item_categories")

  await prisma.itemCategory.delete({ where: { id } })

  revalidatePath("/master/barang")
  await logActivity("delete", "ItemCategory", id, "Menghapus kategori barang")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteItemCategory]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateAccount(id: number, formData: FormData) {

  "use server"

  try {
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
  await logActivity("update", "Account", account.id, "Memperbarui akun")
  return { success: true, id: account.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateAccount]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== BRAND ACTIONS ====================

export async function createBrand(formData: FormData) {
  try {
  await requirePermission("create_brands")

  const brand = await prisma.brand.create({
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/master/merek")
  await logActivity("create", "Brand", brand.id, "Membuat merek")
  redirect("/master/merek")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateBrand(id: number, formData: FormData) {
  try {
  await requirePermission("edit_brands")

  await prisma.brand.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
    },
  })

  revalidatePath("/master/merek")
  await logActivity("update", "Brand", id, "Memperbarui merek")
  redirect("/master/merek")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteBrand(id: number) {
  try {
  await requirePermission("delete_brands")

  await prisma.brand.delete({ where: { id } })

  revalidatePath("/master/merek")
  await logActivity("delete", "Brand", id, "Menghapus merek")
  redirect("/master/merek")

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteBrand]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
