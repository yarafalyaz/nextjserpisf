import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const model = () => ({
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    upsert: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    // Dipakai seedModules untuk mem-prune baris katalog yang permissionnya sudah tidak ada.
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  })
  const prismaMock: any = {
    permission: model(), role: model(), account: model(), systemSetting: model(),
    warehouse: model(), department: model(), position: model(), paymentMethod: model(),
    shippingMethod: model(), unitOfMeasure: model(), expenseCategory: model(),
    documentSequence: model(), module: model(), moduleAction: model(), user: model(), employee: model(),
    withholdingTaxType: model(),
    payrollStatutoryRule: model(),
  }
  prismaMock.$transaction = vi.fn(async (fn: any) => fn(prismaMock))
  // Slug backfill reads the tables that have a `slug` column and then UPDATEs them.
  prismaMock.$queryRawUnsafe = vi.fn().mockResolvedValue([])
  prismaMock.$executeRawUnsafe = vi.fn().mockResolvedValue(0)
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { Prisma } from "@prisma/client"
import { installBaseData } from "../install"
import { PERMISSIONS, ROLES, CHART_OF_ACCOUNTS, WITHHOLDING_TAX_TYPES } from "../base-data"

const input = {
  companyName: "PT Sumber Makmur",
  adminName: "Budi Santoso",
  adminEmail: "Admin@ISF.co.id",
  adminPassword: "rahasia12345",
}

describe("installBaseData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.user.count.mockResolvedValue(0)
    // Two permissions exist so the role mapping can resolve ids.
    mocks.prismaMock.permission.findMany.mockResolvedValue([
      { id: 1, name: "view_dashboard" },
      { id: 2, name: "create_customers" },
    ])
    // COA rows (akun induk) supaya pembuatan anak bisa menempel ke parentId-nya
    // sekaligus auto-map bisa me-resolve id akun.
    const roots = CHART_OF_ACCOUNTS.filter(([, , , parent]) => !parent)
    mocks.prismaMock.account.findMany.mockResolvedValue(
      roots.map(([code, name], index) => ({ id: index + 1, code, name })),
    )
    mocks.prismaMock.user.create.mockResolvedValue({ id: 1, email: "admin@isf.co.id" })
    mocks.prismaMock.$queryRawUnsafe.mockResolvedValue([])
    mocks.prismaMock.$executeRawUnsafe.mockResolvedValue(0)
  })

  it("creates the full permission catalogue and every role", async () => {
    await installBaseData(input)

    const perms = mocks.prismaMock.permission.createMany.mock.calls[0][0]
    expect(perms.skipDuplicates).toBe(true)
    expect(perms.data).toHaveLength(PERMISSIONS.length)

    expect(mocks.prismaMock.role.upsert).toHaveBeenCalledTimes(ROLES.length)
  })

  it("grants super_admin every permission", async () => {
    await installBaseData(input)

    const call = mocks.prismaMock.role.update.mock.calls.find(
      (c: any[]) => c[0].where.name === "super_admin",
    )
    expect(call?.[0].data.permissions.set).toEqual([{ id: 1 }, { id: 2 }])
  })

  it("creates the chart of accounts dengan hierarki (induk dulu, lalu anak)", async () => {
    await installBaseData(input)

    const calls = mocks.prismaMock.account.createMany.mock.calls.map(
      (call: [{ data: { parentId?: number | null; reportGroup?: string | null }[] }]) => call[0].data,
    )
    expect(calls[0].length + calls[1].length).toBe(CHART_OF_ACCOUNTS.length)

    // Tahap pertama = akun induk (tanpa parentId), tahap kedua = anak yang menempel.
    expect(calls[0].every((row: { parentId?: number }) => row.parentId === undefined)).toBe(true)
    expect(calls[1].every((row: { parentId: number | null }) => typeof row.parentId === "number")).toBe(true)

    const roots = CHART_OF_ACCOUNTS.filter(([, , , parent]) => !parent)
    const children = CHART_OF_ACCOUNTS.filter(([, , , parent]) => Boolean(parent))
    expect(calls[0]).toHaveLength(roots.length)
    expect(calls[1]).toHaveLength(children.length)
    // Akun anak wajib punya reportGroup (tipe akun Accurate) agar laporan benar.
    expect(calls[1].every((row: { reportGroup?: string | null }) => Boolean(row.reportGroup))).toBe(true)
  })

  it("hashes the admin password and normalises the email", async () => {
    await installBaseData(input)

    const data = mocks.prismaMock.user.create.mock.calls[0][0].data
    expect(data.email).toBe("admin@isf.co.id")
    expect(data.password).not.toBe(input.adminPassword)
    expect(data.password).toMatch(/^\$2[aby]\$12\$/)
    expect(data.roles.connect).toEqual({ name: "super_admin" })
    expect(data.isActive).toBe(true)
  })

  it("creates a settings row when none exists yet", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue(null)
    await installBaseData(input)
    expect(mocks.prismaMock.systemSetting.create).toHaveBeenCalled()
    expect(mocks.prismaMock.systemSetting.update).not.toHaveBeenCalled()
  })

  it("updates the existing settings row instead of inserting a second", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ id: 7 })
    await installBaseData(input)
    expect(mocks.prismaMock.systemSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    )
    expect(mocks.prismaMock.systemSetting.create).not.toHaveBeenCalled()
  })

  it("creates the administrator and a matching employee record", async () => {
    await installBaseData(input)
    expect(mocks.prismaMock.user.create).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.employee.create).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.employee.create.mock.calls[0][0].data.userId).toBe(1)
  })

  it("persists the full company profile into system settings", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ id: 7 })
    await installBaseData({
      ...input,
      companyEmail: "info@isf.co.id",
      companyPhone: "021-5551234",
      companyAddress: "Jl. Industri No. 1",
      companyWebsite: "https://isf.co.id",
      companyTaxId: "01.234.567.8-901.000",
      companyProvince: "DKI Jakarta",
      companyCity: "Jakarta Pusat",
      companyDistrict: "Cempaka Putih",
      companyVillage: "Cempaka Putih Timur",
      companyPostalCode: "10510",
    })

    const data = mocks.prismaMock.systemSetting.update.mock.calls[0][0].data
    expect(data).toMatchObject({
      companyName: "PT Sumber Makmur",
      companyEmail: "info@isf.co.id",
      companyPhone: "021-5551234",
      companyAddress: "Jl. Industri No. 1",
      companyWebsite: "https://isf.co.id",
      companyTaxId: "01.234.567.8-901.000",
      companyProvince: "DKI Jakarta",
      companyCity: "Jakarta Pusat",
      companyDistrict: "Cempaka Putih",
      companyVillage: "Cempaka Putih Timur",
      companyPostalCode: "10510",
    })
  })

  it("auto-maps the account fields from the freshly created COA", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ id: 7 })
    await installBaseData(input)

    const roots = CHART_OF_ACCOUNTS.filter(([, , , parent]) => !parent)
    const idOf = (code: string) => roots.findIndex(([rootCode]) => rootCode === code) + 1

    const data = mocks.prismaMock.systemSetting.update.mock.calls[0][0].data
    // COA standar (Accurate): Utang Usaha 2101 dan Beban Pokok Penjualan 5101.
    expect(data).toMatchObject({
      purchasePayableAccountId: idOf("2101"),
      cogsAccountId: idOf("5101"),
    })
  })

  it("creates the settings singleton as id 1 with the auto-mapped accounts", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue(null)
    await installBaseData(input)

    const roots = CHART_OF_ACCOUNTS.filter(([, , , parent]) => !parent)
    const payableId = roots.findIndex(([code]) => code === "2101") + 1

    const created = mocks.prismaMock.systemSetting.create.mock.calls[0][0].data
    expect(created.id).toBe(1)
    expect(created.purchasePayableAccountId).toBe(payableId)
  })

  it("runs as a single transaction", async () => {
    await installBaseData(input)
    expect(mocks.prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })

  it("runs the install transaction at Serializable isolation", async () => {
    await installBaseData(input)
    expect(mocks.prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    )
  })

  it("locks the system_settings singleton before creating the administrator", async () => {
    await installBaseData(input)

    const lockCallIndex = mocks.prismaMock.$queryRawUnsafe.mock.calls.findIndex(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("FOR UPDATE"),
    )
    expect(lockCallIndex).toBeGreaterThanOrEqual(0)
    expect(mocks.prismaMock.$queryRawUnsafe.mock.calls[lockCallIndex][0]).toContain("system_settings")

    const lockOrder = mocks.prismaMock.$queryRawUnsafe.mock.invocationCallOrder[lockCallIndex]
    const adminOrder = mocks.prismaMock.user.create.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(adminOrder)
  })

  // Race regresi TASK-021: dua runSetup bersamaan sama-sama lolos
  // isInstalled()===false di luar transaksi. Pengecekan ulang di dalam
  // transaksi harus menolak pemanggil kedua tanpa admin kedua.
  it("rejects a second install when a user already exists inside the transaction", async () => {
    mocks.prismaMock.user.count.mockResolvedValue(1)

    await expect(
      installBaseData({ ...input, adminName: "Penyerang", adminEmail: "second@isf.co.id" }),
    ).rejects.toThrow("Aplikasi sudah terpasang.")

    expect(mocks.prismaMock.user.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.employee.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.permission.createMany).not.toHaveBeenCalled()
  })

  // TASK-024: kalah balapan Serializable melempar P2034 dari Prisma sebelum
  // sempat mencapai lemparan domain di dalam transaksi. Pihak yang kalah
  // harus tetap menerima pesan domain yang sama.
  it("maps a P2034 write conflict from the install transaction to the domain message", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
      { code: "P2034", clientVersion: "test" },
    )
    mocks.prismaMock.$transaction.mockRejectedValueOnce(conflict)

    await expect(installBaseData(input)).rejects.toThrow("Aplikasi sudah terpasang.")
    expect(mocks.prismaMock.user.create).not.toHaveBeenCalled()
  })

  it("rethrows non-concurrency errors from the install transaction unchanged", async () => {
    const boom = new Error("seed gagal: tabel tidak ditemukan")
    mocks.prismaMock.$transaction.mockRejectedValueOnce(boom)

    await expect(installBaseData(input)).rejects.toBe(boom)
  })

  it("creates exactly one super_admin across sequential calls with a stale pre-check", async () => {
    mocks.prismaMock.user.count.mockResolvedValue(0)
    await installBaseData(input)
    expect(mocks.prismaMock.user.create).toHaveBeenCalledTimes(1)

    // Panggilan kedua: cek luar basi (masih mengira belum terpasang), tetapi
    // hitung ulang di dalam transaksi kini melihat admin pemenang.
    mocks.prismaMock.user.count.mockResolvedValue(1)
    await expect(
      installBaseData({ ...input, adminName: "Admin Kedua", adminEmail: "admin2@isf.co.id" }),
    ).rejects.toThrow("Aplikasi sudah terpasang.")

    expect(mocks.prismaMock.user.create).toHaveBeenCalledTimes(1)
    const created = mocks.prismaMock.user.create.mock.calls[0][0].data
    expect(created.roles.connect).toEqual({ name: "super_admin" })
  })

  // Regression: the inserts above leave `slug` NULL, so every list link fell
  // back to the numeric id (`/pengaturan/peran/2/ubah`) on a fresh install.
  it("slugs every table that carries a slug column", async () => {
    mocks.prismaMock.$queryRawUnsafe.mockResolvedValue([
      { TABLE_NAME: "roles" },
      { TABLE_NAME: "accounts" },
    ])

    await installBaseData(input)

    const statements = mocks.prismaMock.$executeRawUnsafe.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    )
    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain("UPDATE `roles`")
    expect(statements[1]).toContain("UPDATE `accounts`")
    expect(statements.every((sql: string) => sql.includes("WHERE t.slug IS NULL"))).toBe(true)
  })

  it("seeds default withholding tax types linked to their COA accounts", async () => {
    // Semua akun COA terlihat (induk + anak) supaya kode anak seperti 110507
    // ikut ter-resolve ke id — helper merujuk akun per kode, bukan per id.
    mocks.prismaMock.account.findMany.mockResolvedValue(
      CHART_OF_ACCOUNTS.map(([code, name], index) => ({ id: index + 1, code, name })),
    )
    mocks.prismaMock.withholdingTaxType.findFirst.mockResolvedValue(null)

    await installBaseData(input)

    const idOf = (code: string) => CHART_OF_ACCOUNTS.findIndex(([c]) => c === code) + 1
    const created = mocks.prismaMock.withholdingTaxType.create.mock.calls.map(
      (c: any[]) => c[0].data,
    )
    expect(created).toHaveLength(WITHHOLDING_TAX_TYPES.length)
    // PPh 22 marketplace 0,5% (PMK-37/2025): aset PPh dibayar dimuka, bukan beban.
    expect(created).toContainEqual({
      code: "PPH22",
      name: "PPh 22",
      rate: 0.5,
      article: null,
      objectCode: null,
      liabilityAccountId: null,
      receivableAccountId: idOf("110507"),
      isActive: true,
    })
    expect(created).toContainEqual(
      expect.objectContaining({ code: "PPH23-BELI", liabilityAccountId: idOf("210202") }),
    )
    // F-038/F-041: sewa final 10% ke 210206 KHUSUS — bukan 210202, bukan 210205 Provisi Garansi.
    expect(created).toContainEqual(
      expect.objectContaining({ code: "PPH42-SEWA", rate: 10, article: "PPh4(2)", objectCode: "28-403-02", liabilityAccountId: idOf("210206"), isActive: true }),
    )
    // F-051-V: 28-403-04 proyek pemerintah disemai NONAKTIF — operator wajib
    // mengaktifkan + membuktikan syarat sebelum katalog membacanya.
    expect(created).toContainEqual(
      expect.objectContaining({ code: "PPH42-SEWA-PP", rate: 10, article: "PPh4(2)", objectCode: "28-403-04", liabilityAccountId: idOf("210206"), isActive: false }),
    )
  })

  it("does not overwrite withholding tax types the tenant already has", async () => {
    mocks.prismaMock.withholdingTaxType.findFirst.mockResolvedValue({ id: 9 })

    await installBaseData(input)

    expect(mocks.prismaMock.withholdingTaxType.create).not.toHaveBeenCalled()
  })

  it("leaves tables without a slug column alone", async () => {
    mocks.prismaMock.$queryRawUnsafe.mockResolvedValue([{ TABLE_NAME: "roles" }])

    await installBaseData(input)

    expect(mocks.prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })
})
