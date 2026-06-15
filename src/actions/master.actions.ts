"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { getSystemSettings } from "@/lib/utils/settings"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { safeId, requireNumber, safeNumber, safeJsonParse, requireString } from "@/lib/utils/safe-parse"
import { logActivity } from "@/lib/services/activity-log.service"
import { customerSchema, vendorSchema, itemSchema, warehouseServerSchema, accountServerSchema } from "@/lib/validations/schemas"
import { parseFormData } from "@/lib/validations/parse-form"
import { employeeSchema } from "@/lib/validators"
import bcrypt from "bcryptjs"

/**
 * Privilege-escalation guard for Employee → User creation/sync flows.
 *
 * `createEmployee` and `updateEmployee` both let a caller mint a brand-new
 * login account (or sync roles onto an existing one) by submitting a list of
 * role IDs in the form. Without this guard, anyone holding `create_employees`
 * or `edit_employees` — even an HR manager with no role-management rights —
 * could pass the `super_admin` role ID and grant themselves (or anyone) full
 * system access, completely bypassing the
 * `assertNoSuperAdminGrant` gate that `auth.actions.ts` enforces for the
 * dedicated user-management path. That would defeat the principle of least
 * privilege and allow a single HR-permission holder to escalate to super admin
 * by editing a single employee record.
 *
 * Returns an error message when the assignment is disallowed, otherwise null.
 * Kept local to this file (not exported) on purpose: it is a server-action
 * helper and must not be reachable from client components.
 */
async function assertNoSuperAdminGrant(
  actorRoles: string[],
  roleIds: number[]
): Promise<string | null> {
  if (actorRoles.includes("super_admin")) return null
  if (roleIds.length === 0) return null
  const requested = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { name: true },
  })
  if (requested.some((r) => r.name === "super_admin")) {
    return "Hanya super admin yang dapat memberikan role super admin"
  }
  return null
}

/**
 * Target-escalation guard for Employee → User update flows.
 *
 * A non-super-admin must not be able to alter the record (or its synced login
 * account) of an employee whose user is super_admin. Without this guard, an
 * `edit_employees` holder could rewrite the super admin's name/email/phone, or
 * — via the `loginRoleIds` sync branch — strip the super_admin role and grant
 * themselves arbitrary elevated permissions, all under the guise of a normal
 * HR edit.
 *
 * Returns an error message when the modification is disallowed, otherwise
 * null. Resolves to null when `targetUserId` is null (employee has no login
 * account yet — the create path covers that case via `assertNoSuperAdminGrant`).
 */
async function assertCanModifyEmployeeTarget(
  actorRoles: string[],
  targetUserId: number | null
): Promise<string | null> {
  if (targetUserId === null) return null
  if (actorRoles.includes("super_admin")) return null
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { roles: { select: { name: true } } },
  })
  if (!target) return null
  if (target.roles.some((r) => r.name === "super_admin")) {
    return "Hanya super admin yang dapat mengubah atau menonaktifkan akun super admin"
  }
  return null
}

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

  const parsed = parseFormData(customerSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const settings = await getSystemSettings()
  let code = v.code || null
  if (settings.enableAutoCustomerCode !== false || !code) {
    code = await generateDocumentNumber("CUST", "simple")
  }

  const customer = await prisma.customer.create({
    data: {
      name: v.name,
      email: v.email ?? null,
      phone: v.phone ?? null,
      address: v.address ?? null,
      city: v.city ?? null,
      contactPerson: v.contactPerson ?? null,
      gender: v.gender ?? null,
      code,
      street: v.street ?? null,
      province: v.province ?? null,
      district: v.district ?? null,
      village: v.village ?? null,
      postalCode: v.postalCode ?? null,
      creditLimit: v.creditLimit ?? 0,
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

  const parsed = parseFormData(customerSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name: v.name,
      email: v.email ?? null,
      phone: v.phone ?? null,
      address: v.address ?? null,
      city: v.city ?? null,
      contactPerson: v.contactPerson ?? null,
      gender: v.gender ?? null,
      code: v.code ?? null,
      street: v.street ?? null,
      province: v.province ?? null,
      district: v.district ?? null,
      village: v.village ?? null,
      postalCode: v.postalCode ?? null,
      creditLimit: v.creditLimit ?? 0,
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

  const parsed = parseFormData(vendorSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const settings = await getSystemSettings()
  let code = v.code || null
  if (settings.enableAutoVendorCode !== false || !code) {
    code = await generateDocumentNumber("VND", "simple")
  }

  const vendor = await prisma.vendor.create({
    data: {
      name: v.name,
      code,
      email: v.email ?? null,
      phone: v.phone ?? null,
      address: v.address ?? null,
      city: v.city ?? null,
      npwp: v.npwp ?? null,
      contactPerson: v.contactPerson ?? null,
      paymentTermId: v.paymentTermId ?? null,
      street: v.street ?? null,
      province: v.province ?? null,
      postalCode: v.postalCode ?? null,
      districtVendor: v.districtVendor ?? null,
      villageVendor: v.villageVendor ?? null,
      bankName: v.bankName ?? null,
      bankAccountNumber: v.bankAccountNumber ?? null,
      bankAccountHolder: v.bankAccountHolder ?? null,
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

  const parsed = parseFormData(vendorSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      name: v.name,
      email: v.email ?? null,
      phone: v.phone ?? null,
      address: v.address ?? null,
      city: v.city ?? null,
      npwp: v.npwp ?? null,
      contactPerson: v.contactPerson ?? null,
      paymentTermId: v.paymentTermId ?? null,
      street: v.street ?? null,
      province: v.province ?? null,
      postalCode: v.postalCode ?? null,
      districtVendor: v.districtVendor ?? null,
      villageVendor: v.villageVendor ?? null,
      bankName: v.bankName ?? null,
      bankAccountNumber: v.bankAccountNumber ?? null,
      bankAccountHolder: v.bankAccountHolder ?? null,
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

  const parsed = parseFormData(itemSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const itemSettings = await getSystemSettings()
  let sku = v.sku || null
  if (itemSettings.enableAutoItemCode !== false || !sku) {
    sku = await generateDocumentNumber("ITM", "simple")
  }

  const itemCost = v.cost
  const itemPrice = v.price
  if (itemPrice < itemCost) {
    return { success: false, error: "Harga jual tidak boleh lebih rendah dari harga beli (modal)." }
  }

  const item = await prisma.item.create({
    data: {
      sku,
      name: v.name,
      description: v.description ?? null,
      image: v.image ?? null,
      categoryId: v.categoryId ?? null,
      brandId: v.brandId ?? null,
      vendorId: v.vendorId ?? null,
      defaultWarehouseId: v.defaultWarehouseId ?? null,
      defaultRackId: v.defaultRackId ?? null,
      defaultRackRowId: v.defaultRackRowId ?? null,
      unitOfMeasure: v.unitOfMeasure,
      qtyOnHand: 0,
      minStock: v.minStock ?? 0,
      cost: itemCost,
      price: itemPrice,
      standardCost: v.standardCost ?? undefined,
      costingMethod: v.costingMethod ?? undefined,
      purchasePrice: v.purchasePrice ?? undefined,
      isProduct: v.isProduct ?? false,
      trackBatch: v.trackBatch ?? false,
      trackSerial: v.trackSerial ?? false,
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

  // Validate with the same schema as createItem — previously updateItem read
  // raw formData (name/sku/unitOfMeasure as string) with no validation, so an
  // empty required field silently wrote null/empty to the row.
  const parsed = parseFormData(itemSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  if (v.price < v.cost) {
    return { success: false, error: "Harga jual tidak boleh lebih rendah dari harga beli (modal)." }
  }

  await prisma.item.update({
    where: { id: itemId },
    data: {
      sku: v.sku || undefined,
      name: v.name,
      description: v.description ?? null,
      image: v.image ?? null,
      categoryId: v.categoryId ?? null,
      brandId: v.brandId ?? null,
      vendorId: v.vendorId ?? null,
      defaultWarehouseId: v.defaultWarehouseId ?? null,
      defaultRackId: v.defaultRackId ?? null,
      defaultRackRowId: v.defaultRackRowId ?? null,
      unitOfMeasure: v.unitOfMeasure,
      minStock: v.minStock ?? 0,
      cost: v.cost,
      price: v.price,
      standardCost: v.standardCost ?? undefined,
      costingMethod: v.costingMethod ?? undefined,
      purchasePrice: v.purchasePrice ?? undefined,
      isProduct: v.isProduct ?? false,
      trackBatch: v.trackBatch ?? false,
      trackSerial: v.trackSerial ?? false,
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

  const parsed = parseFormData(warehouseServerSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  const settings = await getSystemSettings()
  let code = v.code || null
  if (settings.enableAutoWarehouseCode !== false || !code) {
    code = await generateDocumentNumber("WH", "simple")
  }

  const warehouse = await prisma.warehouse.create({
    data: {
      name: v.name,
      code,
      address: v.address ?? null,
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

  const parsed = parseFormData(warehouseServerSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  await prisma.warehouse.update({
    where: { id: warehouseId },
    data: {
      name: v.name,
      code: v.code ?? "",
      address: v.address ?? null,
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
  const actor = await requirePermission("create_employees")

  const settings = await getSystemSettings()
  let employeeNo = (formData.get("employeeNo") as string) || null
  if (settings.enableAutoEmployeeCode !== false || !employeeNo) {
    employeeNo = await generateDocumentNumber("EMP", "simple")
  }

  // Optional login account fields
  const wantsLogin = formData.get("createLoginAccount") === "true" || formData.get("createLoginAccount") === "on"
  const email = formData.get("email") as string | null
  const loginPass = formData.get("loginPassword") as string | null
  const loginRoleIds = formData.getAll("loginRoleIds").map((v) => Number(v)).filter((n) => Number.isFinite(n))

  if (wantsLogin) {
    if (!email || email.trim() === "") {
      return { success: false, error: "Email wajib diisi untuk akun login" }
    }
    if (!loginPass || loginPass.length < 8) {
      return { success: false, error: "Kata sandi minimal 8 karakter" }
    }
    const existing = await prisma.user.findUnique({ where: { email: email.trim() } })
    if (existing) {
      return { success: false, error: "Email sudah terdaftar sebagai pengguna" }
    }
    // Privilege-escalation guard: never let a non-super-admin mint a
    // login account carrying the super_admin role from the Employee form.
    // Mirrors `assertNoSuperAdminGrant` in auth.actions.ts so an HR-permission
    // holder cannot bypass the dedicated user-management gate.
    const grantErr = await assertNoSuperAdminGrant(actor.roles, loginRoleIds)
    if (grantErr) {
      return { success: false, error: grantErr }
    }
  }

  const employeeData = {
      employeeNo,
      name: requireString(formData.get("name"), "name"),
      email: email,
      phone: formData.get("phone") as string | null,
      gender: formData.get("gender") as string | null || null,
      dateOfBirth: formData.get("dateOfBirth") ? new Date(formData.get("dateOfBirth") as string) : null,
      maritalStatus: formData.get("maritalStatus") as string | null || null,
      departmentId: safeId(formData.get("departmentId")),
      positionId: safeId(formData.get("positionId")),
      joinDate: new Date(requireString(formData.get("joinDate"), "joinDate")),
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
  }

  // Create employee + (optionally) a linked login account atomically.
  const employee = await prisma.$transaction(async (tx) => {
    if (wantsLogin && email && loginPass) {
      const hashedPassword = await bcrypt.hash(loginPass, 12)
      const user = await tx.user.create({
        data: {
          name: employeeData.name,
          email: email.trim(),
          password: hashedPassword,
          isActive: true,
          ...(loginRoleIds.length > 0
            ? { roles: { connect: loginRoleIds.map((id) => ({ id })) } }
            : {}),
        },
      })
      return tx.employee.create({ data: { ...employeeData, userId: user.id } })
    }
    return tx.employee.create({ data: employeeData })
  })

  revalidatePath("/master/karyawan")
  await logActivity("create", "Employee", employee.id, wantsLogin ? "Membuat karyawan + akun login" : "Membuat karyawan")
  return { success: true, id: employee.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createEmployee]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateEmployee(employeeId: number, formData: FormData) {
  try {
  const actor = await requirePermission("edit_employees")

  // Optional: create a login account for an employee that does not have one yet.
  const wantsLogin = formData.get("createLoginAccount") === "true" || formData.get("createLoginAccount") === "on"
  const email = formData.get("email") as string | null
  const loginPass = formData.get("loginPassword") as string | null
  const loginRoleIds = formData.getAll("loginRoleIds").map((v) => Number(v)).filter((n) => Number.isFinite(n))

  // Look up whether this employee already has a linked login account.
  const current = await prisma.employee.findUnique({ where: { id: employeeId }, select: { userId: true } })
  const trimmedEmail = email?.trim() || null

  // Target-escalation guard: a non-super-admin must not be able to alter the
  // record/login account of an employee whose user is super_admin (rewrite its
  // name/email, or strip/replace its roles via the sync branch below).
  const targetErr = await assertCanModifyEmployeeTarget(actor.roles, current?.userId ?? null)
  if (targetErr) {
    return { success: false, error: targetErr }
  }

  if (wantsLogin) {
    if (current?.userId) {
      return { success: false, error: "Karyawan ini sudah memiliki akun login" }
    }
    if (!trimmedEmail) {
      return { success: false, error: "Email wajib diisi untuk akun login" }
    }
    if (!loginPass || loginPass.length < 8) {
      return { success: false, error: "Kata sandi minimal 8 karakter" }
    }
    const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } })
    if (existing) {
      return { success: false, error: "Email sudah terdaftar sebagai pengguna" }
    }
  }

  // Privilege-escalation guard: block granting the super_admin role from the
  // Employee form on BOTH the "create new login" and the "sync existing login"
  // branches. Applies whenever role IDs are submitted, regardless of wantsLogin.
  const grantErr = await assertNoSuperAdminGrant(actor.roles, loginRoleIds)
  if (grantErr) {
    return { success: false, error: grantErr }
  }

  // If the employee already has a login account and the email is changing,
  // keep the user's login email in sync (email IS the login credential).
  let syncUserId: number | null = null
  if (!wantsLogin && current?.userId && trimmedEmail) {
    const clash = await prisma.user.findUnique({ where: { email: trimmedEmail } })
    if (clash && clash.id !== current.userId) {
      return { success: false, error: "Email sudah terdaftar sebagai pengguna lain" }
    }
    syncUserId = current.userId
  }

  const updateData = {
      name: requireString(formData.get("name"), "name"),
      email: email,
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
  }

  await prisma.$transaction(async (tx) => {
    if (wantsLogin && email && loginPass) {
      const hashedPassword = await bcrypt.hash(loginPass, 12)
      const user = await tx.user.create({
        data: {
          name: updateData.name,
          email: email.trim(),
          password: hashedPassword,
          isActive: true,
          ...(loginRoleIds.length > 0
            ? { roles: { connect: loginRoleIds.map((id) => ({ id })) } }
            : {}),
        },
      })
      await tx.employee.update({ where: { id: employeeId }, data: { ...updateData, userId: user.id } })
    } else {
      await tx.employee.update({ where: { id: employeeId }, data: updateData })
      // Keep the linked login account's email + name + roles in sync with the employee.
      if (syncUserId) {
        await tx.user.update({
          where: { id: syncUserId },
          data: {
            name: updateData.name,
            ...(trimmedEmail ? { email: trimmedEmail } : {}),
            ...(loginRoleIds.length > 0
              ? { roles: { set: loginRoleIds.map((id) => ({ id })) } }
              : {}),
          },
        })
      }
    }
  })

  revalidatePath("/master/karyawan")
  await logActivity("update", "Employee", employeeId, wantsLogin ? "Memperbarui karyawan + buat akun login" : "Memperbarui karyawan")
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

  const parsed = parseFormData(accountServerSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  let code = v.code || null
  if (!code) {
    code = await generateDocumentNumber("ACC", "simple")
  }

  const account = await prisma.account.create({
    data: {
      code,
      name: v.name,
      type: v.type,
      parentId: v.parentId ?? null,
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
      name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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
          name: requireString(formData.get("name"), "name"),
          code,
          departmentId: safeId(formData.get("departmentId")),
        },
      })

      revalidatePath("/master/karyawan")
      await logActivity("create", "Position", position.id, "Membuat jabatan")
      return { success: true, id: position.id }
    } catch (createErr: unknown) {
      const err = createErr as { code?: string; meta?: { target?: string[] }; message?: string }
      const isUniqueCodeConflict = err?.code === "P2002" && (
        (Array.isArray(err?.meta?.target) && err.meta.target.includes("code")) ||
        String(err?.message || "").includes("positions_code_key")
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
      name: requireString(formData.get("name"), "name"),
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
    name: requireString(formData.get("name"), "name"),
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
  const actor = await requirePermission("edit_leads")
  const isAdmin = actor.permissions.includes("manage_leads") || actor.roles.includes("super_admin")

  const existing = await prisma.lead.findUniqueOrThrow({ where: { id } })
  
  // Security Guard: Sales can only edit their own leads unless they have manage_leads permission.
  if (!isAdmin && existing.assignedTo !== Number(actor.id)) {
    throw new Error("Anda hanya dapat mengubah lead yang ditugaskan kepada Anda.")
  }

  const newAssignedTo = safeId(formData.get("assignedTo"))
  
  // Security Guard: Only admins can re-assign leads to others.
  if (!isAdmin && newAssignedTo !== existing.assignedTo) {
    throw new Error("Anda tidak memiliki izin untuk mengubah penugasan (assignee) lead.")
  }

  await prisma.lead.update({
    where: { id },
    data: {
      name: requireString(formData.get("name"), "name"),
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
      assignedTo: newAssignedTo,
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
      name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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

  const isBase = formData.get("isBase") === "on"

  const currency = await prisma.$transaction(async (tx) => {
    // Guard: only one currency may be base — clear all others first.
    if (isBase) {
      await tx.currency.updateMany({ where: { isBase: true }, data: { isBase: false } })
    }
    return tx.currency.create({
      data: {
        code: formData.get("code") as string,
        name: requireString(formData.get("name"), "name"),
        rate: (safeNumber(formData.get("rate")) ?? 0),
        symbol: (formData.get("symbol") as string) || undefined,
        symbolPosition: (formData.get("symbolPosition") as string) || undefined,
        decimalSeparator: (formData.get("decimalSeparator") as string) || undefined,
        thousandsSeparator: (formData.get("thousandsSeparator") as string) || undefined,
        decimalPlaces: safeNumber(formData.get("decimalPlaces")) ?? undefined,
        isBase,
        isActive: true,
      },
    })
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

  const isBase = formData.get("isBase") === "on"

  await prisma.$transaction(async (tx) => {
    // Guard: only one currency may be base — clear all others first.
    if (isBase) {
      await tx.currency.updateMany({ where: { isBase: true, id: { not: id } }, data: { isBase: false } })
    }
    await tx.currency.update({
      where: { id },
      data: {
        code: formData.get("code") as string,
        name: requireString(formData.get("name"), "name"),
        rate: (safeNumber(formData.get("rate")) ?? 0),
        symbol: (formData.get("symbol") as string) || undefined,
        symbolPosition: (formData.get("symbolPosition") as string) || undefined,
        decimalSeparator: (formData.get("decimalSeparator") as string) || undefined,
        thousandsSeparator: (formData.get("thousandsSeparator") as string) || undefined,
        decimalPlaces: safeNumber(formData.get("decimalPlaces")) ?? undefined,
        isBase,
      },
    })
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
      barcode: requireString(formData.get("barcode"), "barcode"),
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
        barcode: requireString(formData.get("barcode"), "barcode"),
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

  const name = requireString(formData.get("name"), "name")
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
    const name = requireString(formData.get("name"), "name")
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
      name: requireString(formData.get("name"), "name"),
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
        name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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

  // Capture the linked login account (if any) before deleting.
  const existing = await prisma.employee.findUnique({ where: { id }, select: { userId: true } })

  await hardDeleteOrSoftDelete(
    () => prisma.employee.delete({ where: { id } }),
    () => prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } }),
  )

  // Security: a deleted employee must not retain a working login. Deactivate
  // the linked user account so their credentials stop authenticating
  // (auth enforces isActive and re-syncs tokens, so this revokes access).
  if (existing?.userId) {
    await prisma.user.update({ where: { id: existing.userId }, data: { isActive: false } })
  }

  revalidatePath("/master/karyawan")
  await logActivity("delete", "Employee", id, existing?.userId ? "Menghapus karyawan + nonaktifkan akun login" : "Menghapus karyawan")
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

  // Guard: cannot delete department with active employees
  const empCount = await prisma.employee.count({
    where: { departmentId: id, deletedAt: null },
  })
  if (empCount > 0) {
    throw new Error(`Departemen masih memiliki ${empCount} karyawan aktif`)
  }

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

  // Guard: cannot delete a position with active employees. Mirrors
  // deleteDepartment's guard — Employee.positionId is nullable and the FK has
  // no explicit onDelete, so a raw delete would silently null the positionId
  // on every active employee holding this title, erasing their job-title
  // assignment with no warning. Same data-integrity rationale: refuse and let
  // the operator move/reassign employees first.
  const empCount = await prisma.employee.count({
    where: { positionId: id, deletedAt: null },
  })
  if (empCount > 0) {
    throw new Error(`Jabatan masih memiliki ${empCount} karyawan aktif`)
  }

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
  await requirePermission("edit_accounts")

  const parsed = parseFormData(accountServerSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  const v = parsed.data

  // Account code is an accounting identifier; silently regenerating it when the
  // user clears the field would corrupt the audit trail and break references
  // to this account in historical journal entries. Read the current code from
  // the DB and preserve it if the form sent nothing usable.
  const submittedCode = v.code?.trim() || null
  let code: string
  if (!submittedCode) {
    const current = await prisma.account.findUnique({
      where: { id },
      select: { code: true },
    })
    if (!current) throw new Error("Akun tidak ditemukan")
    code = current.code
  } else {
    code = submittedCode
  }

  const account = await prisma.account.update({
    where: { id },
    data: {
      code,
      name: v.name,
      type: v.type,
      parentId: v.parentId ?? null,
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
      name: requireString(formData.get("name"), "name"),
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
      name: requireString(formData.get("name"), "name"),
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
