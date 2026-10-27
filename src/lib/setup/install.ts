import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { resolveAllAccountMappings } from "@/lib/utils/account-automap"
import { seedModules } from "./modules"
import {
  PERMISSIONS,
  ROLES,
  ADMIN_WHITELIST,
  STAFF_WHITELIST,
  GA_WHITELIST,
  KABENG_WHITELIST,
  KARYAWAN_WHITELIST,
  PURCHASING_WHITELIST,
  WAREHOUSE_WHITELIST,
  FINANCE_WHITELIST,
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  DOCUMENT_SEQUENCE_KEYS,
  UNITS_OF_MEASURE,
  EXPENSE_CATEGORIES,
  DEPARTMENTS,
  POSITIONS,
} from "./base-data"
import { createChartOfAccounts } from "./coa"
import { seedWithholdingTaxTypes } from "./withholding-tax-types"
import {
  INSTALL_SLUG_SOURCES,
  SLUG_COLUMN_QUERY,
  slugBackfillSql,
  slugTablesFromRows,
} from "./slug-backfill"

export interface InstallInput {
  companyName: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyWebsite?: string
  companyTaxId?: string
  companyProvince?: string
  companyCity?: string
  companyDistrict?: string
  companyVillage?: string
  companyPostalCode?: string
  adminName: string
  adminEmail: string
  adminPassword: string
}

/** Default permission sets per role ("ALL" = every permission). */
const ROLE_WHITELISTS: Record<string, string[] | "ALL"> = {
  super_admin: "ALL",
  admin: ADMIN_WHITELIST,
  staff: STAFF_WHITELIST,
  ga: GA_WHITELIST,
  kepala_bengkel: KABENG_WHITELIST,
  karyawan: KARYAWAN_WHITELIST,
  purchasing: PURCHASING_WHITELIST,
  warehouse: WAREHOUSE_WHITELIST,
  finance: FINANCE_WHITELIST,
}

export const DEFAULT_WAREHOUSE = { code: "WH-0001", name: "Gudang Utama" }

/**
 * Create the base data for a fresh install and the first administrator.
 *
 * Runs in a single transaction: if any step fails the database is left
 * untouched, so the operator can simply retry the wizard. Intended to be called
 * exactly once: the caller's `isInstalled()` guard is re-checked inside the
 * transaction under a `system_settings` row lock, so a concurrent second call
 * fails instead of creating a second administrator.
 */
export async function installBaseData(input: InstallInput): Promise<{ adminEmail: string }> {
  const adminEmail = input.adminEmail.trim().toLowerCase()
  const adminPasswordHash = await bcrypt.hash(input.adminPassword, 12)

  return prisma.$transaction(
    async (tx) => {
    // Serialize concurrent first-install attempts on the singleton
    // `system_settings` row, then re-count users inside the transaction.
    // The caller's `isInstalled()` check is outside the transaction, so two
    // concurrent `runSetup` calls can both observe "not installed"; the loser
    // must re-check here — after acquiring the row lock, hence after the
    // winner commits — instead of creating a second `super_admin`.
    const lockedSettings = await tx.$queryRawUnsafe<Array<{ id: number }>>(
      "SELECT id FROM `system_settings` ORDER BY id ASC LIMIT 1 FOR UPDATE",
    )
    if (lockedSettings.length === 0) {
      await tx.systemSetting.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      })
      await tx.$queryRawUnsafe("SELECT id FROM `system_settings` WHERE id = 1 FOR UPDATE")
    }
    const existingUserCount = await tx.user.count()
    if (existingUserCount > 0) {
      throw new Error("Aplikasi sudah terpasang.")
    }

    // 1. RBAC catalogue — permissions, roles, role→permission mappings.
    await tx.permission.createMany({
      data: PERMISSIONS.map((name) => ({ name })),
      skipDuplicates: true,
    })
    for (const name of ROLES) {
      await tx.role.upsert({ where: { name }, create: { name }, update: {} })
    }

    const allPermissions = await tx.permission.findMany({ select: { id: true, name: true } })
    const permissionIdByName = new Map(allPermissions.map((p) => [p.name, p.id]))
    for (const roleName of ROLES) {
      const whitelist = ROLE_WHITELISTS[roleName]
      const ids =
        whitelist === "ALL"
          ? allPermissions.map((p) => p.id)
          : (whitelist ?? [])
              .map((name) => permissionIdByName.get(name))
              .filter((id): id is number => id != null)
      await tx.role.update({
        where: { name: roleName },
        data: { permissions: { set: ids.map((id) => ({ id })) } },
      })
    }

    // 2. Chart of accounts — induk dibuat lebih dulu, lalu anak menempel ke
    // parentId-nya supaya hierarki COA (dan opsi "Akun Induk/Anak" di laporan) terbentuk.
    await createChartOfAccounts(tx)
    // Auto-map every account field from the COA just created, so journals post
    // from the very first transaction without a manual "Auto-Map Akun" pass.
    const coa = await tx.account.findMany({ select: { id: true, code: true, name: true } })
    const accountMappings = resolveAllAccountMappings(coa)
    const mappingFields: Record<string, number> = {}
    for (const [key, value] of Object.entries(accountMappings)) {
      if (value) mappingFields[key] = Number(value)
    }

    // 2b. Jenis potongan PPh bawaan tertaut akun COA di atas (PPh 22
    // marketplace 0,5% dst.) — tanpa ini hook akuntansi fail-closed menolak
    // jurnal pembayaran berpotongan PPh pada instalasi baru.
    await seedWithholdingTaxTypes(tx)

    // 3. System settings. `getSystemSettings()` auto-creates a default row on the
    // first page render, so update it when present; otherwise create the
    // singleton with id = 1 so parallel renders can never add a second row.
    const settingsData = {
      companyName: input.companyName.trim(),
      companyEmail: input.companyEmail?.trim() || adminEmail,
      companyPhone: input.companyPhone?.trim() || null,
      companyAddress: input.companyAddress?.trim() || null,
      companyWebsite: input.companyWebsite?.trim() || null,
      companyTaxId: input.companyTaxId?.trim() || null,
      companyProvince: input.companyProvince?.trim() || null,
      companyCity: input.companyCity?.trim() || null,
      companyDistrict: input.companyDistrict?.trim() || null,
      companyVillage: input.companyVillage?.trim() || null,
      companyPostalCode: input.companyPostalCode?.trim() || null,
      ...mappingFields,
    } as Prisma.SystemSettingUncheckedUpdateInput
    const existingSettings = await tx.systemSetting.findFirst({ select: { id: true } })
    if (existingSettings) {
      await tx.systemSetting.update({ where: { id: existingSettings.id }, data: settingsData })
    } else {
      await tx.systemSetting.create({
        data: { id: 1, ...settingsData } as Prisma.SystemSettingUncheckedCreateInput,
      })
    }

    // 4. Default warehouse, departments and positions.
    await tx.warehouse.createMany({
      data: [{ code: DEFAULT_WAREHOUSE.code, name: DEFAULT_WAREHOUSE.name, address: "Jl. Industri No. 1" }],
      skipDuplicates: true,
    })
    const departmentIdByName = new Map<string, number>()
    for (const [code, name] of DEPARTMENTS) {
      const dept = await tx.department.create({ data: { code, name } })
      departmentIdByName.set(name, dept.id)
    }
    for (const [code, name, deptName] of POSITIONS) {
      await tx.position.create({
        data: { code, name, departmentId: departmentIdByName.get(deptName) ?? null },
      })
    }

    // 5. Master defaults (methods, units, expense categories, document numbers).
    await tx.paymentMethod.createMany({
      data: PAYMENT_METHODS.map(([code, name]) => ({ code, name })),
      skipDuplicates: true,
    })
    await tx.shippingMethod.createMany({
      data: SHIPPING_METHODS.map(([code, name]) => ({ code, name })),
      skipDuplicates: true,
    })
    await tx.unitOfMeasure.createMany({ data: UNITS_OF_MEASURE.map((u) => ({ ...u })) })
    await tx.expenseCategory.createMany({
      data: EXPENSE_CATEGORIES.map((c) => ({ name: c.name, label: c.label, sortOrder: c.sort })),
      skipDuplicates: true,
    })
    await tx.documentSequence.createMany({
      data: DOCUMENT_SEQUENCE_KEYS.map((key) => ({ key })),
      skipDuplicates: true,
    })

    // 6. RBAC module catalogue.
    await seedModules(tx)

    // 7. First administrator (+ a matching employee record so HR screens work).
    const admin = await tx.user.create({
      data: {
        name: input.adminName.trim(),
        email: adminEmail,
        password: adminPasswordHash,
        isActive: true,
        roles: { connect: { name: "super_admin" } },
      },
    })
    const department = await tx.department.findFirst({ where: { name: "Kantor" }, select: { id: true } })
    const position = await tx.position.findFirst({ where: { name: "Manajer Umum" }, select: { id: true } })
    await tx.employee.create({
      data: {
        userId: admin.id,
        employeeNo: "EMP-00001",
        name: input.adminName.trim(),
        email: adminEmail,
        joinDate: new Date(),
        departmentId: department?.id ?? null,
        positionId: position?.id ?? null,
      },
    })

    // 8. Human-readable URLs from the very first page load. Every insert above
    // leaves `slug` NULL, which is exactly what makes links fall back to the
    // numeric id (`/pengaturan/peran/2/ubah`) — the seed CLI runs the same pass,
    // see ./slug-backfill.ts.
    const slugTables = slugTablesFromRows(
      await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(SLUG_COLUMN_QUERY),
    )
    for (const table of Object.keys(INSTALL_SLUG_SOURCES)) {
      if (!slugTables.has(table)) continue
      const sql = slugBackfillSql(table)
      if (sql) await tx.$executeRawUnsafe(sql)
    }

    return { adminEmail }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
}
