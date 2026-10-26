import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })

  const prismaMock: any = {
    customer: buildModelMock(),
    customerVehicle: buildModelMock(),
    vendor: buildModelMock(),
    item: buildModelMock(),
    itemCategory: buildModelMock(),
    warehouse: buildModelMock(),
    employee: buildModelMock(),
    account: buildModelMock(),
    department: buildModelMock(),
    position: buildModelMock(),
    lead: buildModelMock(),
    leadActivity: buildModelMock(),
    bank: buildModelMock(),
    bankStatement: buildModelMock(),
    tax: {
      ...buildModelMock(),
      // TaxGroup existence check: reflect requested ids as found rows.
      findMany: vi.fn(async (args: any) => (args?.where?.id?.in ?? []).map((id: number) => ({ id }))),
    },
    barcode: buildModelMock(),
    activityLog: buildModelMock(),
    taxGroup: buildModelMock(),
    taxGroupTax: buildModelMock(),
    paymentTerm: buildModelMock(),
    brand: buildModelMock(),
    customerCategory: buildModelMock(),
    stockMovement: buildModelMock(),
    itemStock: buildModelMock(),
    user: buildModelMock(),
    uomConversion: buildModelMock(),
    unitOfMeasure: buildModelMock(),

    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock, Prisma: { PrismaClientKnownRequestError: class {} } }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001") }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn().mockResolvedValue({ enableAutoCustomerCode: true }) }))
vi.mock("bcryptjs", () => {
  const m = {
    hash: vi.fn().mockResolvedValue("hash"),
    compare: vi.fn().mockResolvedValue(true),
  }
  return {
    ...m,
    default: m
  }
})

import * as actions from "../master.actions"
import { LEAD_LOST_REASON_CATEGORIES } from "@/lib/reports/lead-lost-reason"
import { Prisma as RealPrisma } from "@prisma/client"

describe("FK fiktif customerCategoryId/paymentTermId (repro)", () => {
  it("createCustomer tolak customerCategoryId fiktif", async () => {
    const res = await actions.createCustomer(fdMap({ name: "X", customerCategoryId: "999999" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.customer.create).not.toHaveBeenCalled()
  })
  it("updateCustomer tolak customerCategoryId fiktif", async () => {
    const res = await actions.updateCustomer(1, fdMap({ name: "X", customerCategoryId: "999999" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.customer.update).not.toHaveBeenCalled()
  })
  it("createVendor tolak paymentTermId fiktif", async () => {
    const res = await actions.createVendor(fdMap({ name: "V", paymentTermId: "999999" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.vendor.create).not.toHaveBeenCalled()
  })
  it("updateVendor tolak paymentTermId fiktif", async () => {
    const res = await actions.updateVendor(1, fdMap({ name: "V", paymentTermId: "999999" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.vendor.update).not.toHaveBeenCalled()
  })
})

function makeP2003(): unknown {
  return new RealPrisma.PrismaClientKnownRequestError("FK violation", {
    code: "P2003",
    clientVersion: "test",
  })
}

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, permissions: ["manage_leads"], roles: ["super_admin"] })
  // F-2026-10-25-042-V: updateItem membaca item tersimpan (penjaga scrap/
  // default pajak); default mock = item non-scrap tanpa default supaya
  // tes lama tidak bergantung urutan mockResolvedValueOnce.
  mocks.prismaMock.item.findUnique.mockResolvedValue({ isScrapSaleItem: false, defaultSalesTaxId: null, defaultPurchaseTaxId: null, defaultDppPercent: null })
})

describe("Customer Actions", () => {
  it("createCustomer succeeds", async () => {
    const res = await actions.createCustomer(fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updateCustomer succeeds", async () => {
    const res = await actions.updateCustomer(1, fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("deleteCustomer succeeds", async () => {
    const res = await actions.deleteCustomer(1)
    expect(res?.success).toBe(true)
  })
})

describe("F-2026-10-25-003-S duplikat pelanggan (AC-CD-B4/B5/B7)", () => {
  it("AC-CD-B7: quick-add reuse menyatakan reused + identitas; id sama perilaku existing", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValueOnce({ id: 42, slug: "pt-sinar", name: "PT Sinar", code: "CUST-0042" })
    const res: any = await actions.createCustomer(fdMap({ name: "PT Sinar", phone: "0812-3456-7890" }))
    expect(res.success).toBe(true)
    expect(res.id).toBe(42)
    expect(res.reused).toBe(true)
    expect(res.reusedCustomer).toEqual({ id: 42, name: "PT Sinar", code: "CUST-0042", slug: "pt-sinar" })
    expect(typeof res.message).toBe("string")
    expect(mocks.prismaMock.customer.create).not.toHaveBeenCalled()
  })

  it("AC-CD-B4: simpan tetap sukses + duplicateWarning kandidat telepon ternormalisasi (AC-CD-B1)", async () => {
    mocks.prismaMock.customer.create.mockResolvedValue({ id: 99, slug: "baru" })
    mocks.prismaMock.customer.findMany.mockResolvedValue([
      { id: 11, slug: "pt-sinar", name: "PT Sinar", code: "CUST-0011", phone: "0812-3456-7890", email: null, taxId: null },
    ])
    const res: any = await actions.createCustomer(fdMap({ name: "Pelanggan Baru", phone: "+62 812-3456-7890" }))
    expect(res.success).toBe(true)
    expect(res.id).toBe(99)
    expect(res.duplicateWarning?.candidates).toHaveLength(1)
    expect(res.duplicateWarning.candidates[0]).toMatchObject({ id: 11, matchKind: "phone" })
  })

  it("AC-CD-B4: tanpa kecocokan -> duplicateWarning null, perilaku simpan tak berubah", async () => {
    mocks.prismaMock.customer.create.mockResolvedValue({ id: 100, slug: "baru2" })
    mocks.prismaMock.customer.findMany.mockResolvedValue([])
    const res: any = await actions.createCustomer(fdMap({ name: "Benar Baru", phone: "0857-1111-2222" }))
    expect(res.success).toBe(true)
    expect(res.duplicateWarning).toBeNull()
  })

  it("AC-CD-B5: updateCustomer kandidat memuat B, excludeId diri diteruskan", async () => {
    mocks.prismaMock.customer.findMany.mockResolvedValue([
      { id: 12, slug: "b", name: "Pelanggan B", code: "CUST-0012", phone: "+6281234567890", email: null, taxId: null },
    ])
    const res: any = await actions.updateCustomer(11, fdMap({ name: "Pelanggan A", phone: "0812-3456-7890" }))
    expect(res.success).toBe(true)
    expect(res.duplicateWarning?.candidates.map((c: any) => c.id)).toEqual([12])
    expect(mocks.prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 11 } }) }),
    )
  })

  it("Q-CD-1 create: NPWP persis beda format (titik/strip) = BLOKIR, create tidak terpanggil, respons terstruktur menyebut pemegang", async () => {
    mocks.prismaMock.customer.create.mockResolvedValue({ id: 99, slug: "baru" })
    mocks.prismaMock.customer.findMany.mockResolvedValue([
      { id: 11, slug: "pt-sinar", name: "PT Sinar", code: "CUST-0011", phone: null, email: null, taxId: "012345678901000" },
    ])
    const res: any = await actions.createCustomer(fdMap({ name: "Pelanggan Baru", taxId: "01.234.567.8-901.000" }))
    expect(res.success).toBe(false)
    expect(res.error).toBe("NPWP yang sama sudah tercatat atas nama PT Sinar (CUST-0011). Pakai pelanggan yang sudah ada itu, atau perbaiki NPWP bila salah ketik.")
    expect(res.npwpConflict).toEqual({ id: 11, slug: "pt-sinar", name: "PT Sinar", code: "CUST-0011", title: "NPWP sudah dipakai pelanggan lain" })
    expect(res.duplicateWarning).toBeUndefined()
    expect(mocks.prismaMock.customer.create).not.toHaveBeenCalled()
  })

  it("Q-CD-1 create: NPWP kosong lolos (bukan konflik, bukan kandidat)", async () => {
    mocks.prismaMock.customer.create.mockResolvedValue({ id: 100, slug: "baru2" })
    mocks.prismaMock.customer.findMany.mockResolvedValue([])
    const res: any = await actions.createCustomer(fdMap({ name: "Benar Baru" }))
    expect(res.success).toBe(true)
    expect(res.duplicateWarning).toBeNull()
  })

  it("Q-CD-1 update: NPWP persis milik pelanggan LAIN = BLOKIR, update tidak terpanggil", async () => {
    mocks.prismaMock.customer.findMany.mockResolvedValue([
      { id: 12, slug: "b", name: "Pelanggan B", code: "CUST-0012", phone: null, email: null, taxId: "012345678901000" },
    ])
    const res: any = await actions.updateCustomer(11, fdMap({ name: "Pelanggan A", taxId: "01.234.567.8-901.000" }))
    expect(res.success).toBe(false)
    expect(res.npwpConflict).toMatchObject({ id: 12, name: "Pelanggan B", code: "CUST-0012" })
    expect(mocks.prismaMock.customer.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 11 } }) }),
    )
  })

  it("Q-CD-1 update: self-match NPWP sendiri lolos (where mengecualikan diri, scan kosong)", async () => {
    mocks.prismaMock.customer.findMany.mockResolvedValue([])
    const res: any = await actions.updateCustomer(11, fdMap({ name: "Pelanggan A", taxId: "01.234.567.8-901.000" }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.customer.update).toHaveBeenCalled()
  })

  it("listCustomerDuplicateCandidates: grup >=2 saja lewat izin view_customers", async () => {
    mocks.prismaMock.customer.findMany.mockResolvedValue([
      { id: 11, slug: "a", name: "PT Sinar", code: "C1", phone: "0812-3456-7890", email: null, taxId: null },
      { id: 12, slug: "b", name: "PT Sinar 2", code: "C2", phone: "+6281234567890", email: null, taxId: null },
      { id: 13, slug: "c", name: "Unik", code: "C3", phone: "0857-0000-9999", email: null, taxId: null },
    ])
    const res: any = await actions.listCustomerDuplicateCandidates()
    expect(res.success).toBe(true)
    expect(res.groups).toHaveLength(1)
    expect(res.groups[0].members.map((m: any) => m.id)).toEqual([11, 12])
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("view_customers")
  })
})

describe("Vendor Actions", () => {
  it("createVendor succeeds", async () => {
    const res = await actions.createVendor(fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updateVendor succeeds", async () => {
    const res = await actions.updateVendor(1, fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("deleteVendor succeeds", async () => {
    const res = await actions.deleteVendor(1)
    expect(res?.success).toBe(true)
  })
})

describe("Item Actions", () => {
  it("createItem succeeds", async () => {
    const res = await actions.createItem(fdMap({ name: "Item Test", cost: "100", price: "200" }))
    expect(res?.success).toBe(true)
  })
  it("updateItem succeeds", async () => {
    const res = await actions.updateItem(1, fdMap({ name: "Item Test Updated", cost: "100", price: "200" }))
    expect(res?.success).toBe(true)
  })
  // E135-7 (simpan): isScrapSaleItem=true && isProduct=true ditolak
  // sebelum tulis; item besi tua tidak boleh masuk jalur stok/COGS.
  it("createItem menolak item besi tua berstatus produk", async () => {
    const res = await actions.createItem(fdMap({ name: "Besi Tua", cost: "100", price: "200", isScrapSaleItem: "true", isProduct: "true" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/tidak boleh isProduct=true/)
    expect(mocks.prismaMock.item.create).not.toHaveBeenCalled()
  })
  it("updateItem menolak item besi tua berstatus produk", async () => {
    const res = await actions.updateItem(1, fdMap({ name: "Besi Tua", cost: "100", price: "200", isScrapSaleItem: "true", isProduct: "true" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/tidak boleh isProduct=true/)
    expect(mocks.prismaMock.item.update).not.toHaveBeenCalled()
  })
  it("deleteItem succeeds", async () => {
    const res = await actions.deleteItem(1)
    expect(res?.success).toBe(true)
  })
  // F-2026-10-25-042-V (vonis Q-ITX-1): default pajak per item.
  it("createItem menyimpan default pajak sah + audit metadata", async () => {
    mocks.prismaMock.tax.findUnique.mockResolvedValue({ id: 7, isActive: true, deletedAt: null })
    const res = await actions.createItem(fdMap({ name: "Item Pajak", cost: "100", price: "200", defaultSalesTaxId: "7", defaultDppPercent: "50" }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.item.create.mock.calls[0][0].data
    expect(data.defaultSalesTaxId).toBe(7)
    expect(data.defaultPurchaseTaxId).toBeNull()
    expect(data.defaultDppPercent).toBe(50)
    expect(mocks.logActivityMock).toHaveBeenCalledWith("create", "Item", 1, "Membuat barang", {
      defaultSalesTaxId: 7,
      defaultPurchaseTaxId: null,
      defaultDppPercent: 50,
    })
  })
  it("createItem menolak scrap ber-default pajak (Putusan 5)", async () => {
    const res = await actions.createItem(fdMap({ name: "Besi Tua", cost: "100", price: "200", isScrapSaleItem: "true", defaultDppPercent: "50" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/besi tua/)
    expect(mocks.prismaMock.item.create).not.toHaveBeenCalled()
  })
  it("createItem menolak persen DPP di luar 0-100 (Putusan 2)", async () => {
    const res = await actions.createItem(fdMap({ name: "Item X", cost: "100", price: "200", defaultDppPercent: "101" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/0,00 dan 100,00/)
    expect(mocks.prismaMock.item.create).not.toHaveBeenCalled()
  })
  it("createItem menolak rujukan Tax nonaktif (fail-closed Putusan 3)", async () => {
    mocks.prismaMock.tax.findUnique.mockResolvedValue({ id: 7, isActive: false, deletedAt: null })
    const res = await actions.createItem(fdMap({ name: "Item X", cost: "100", price: "200", defaultSalesTaxId: "7" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/nonaktif/)
    expect(mocks.prismaMock.item.create).not.toHaveBeenCalled()
  })
  it("updateItem menolak scrap tersimpan + persen warisan tanpa field form", async () => {
    mocks.prismaMock.item.findUnique.mockResolvedValue({ isScrapSaleItem: true, defaultSalesTaxId: null, defaultPurchaseTaxId: null, defaultDppPercent: 50 })
    const res = await actions.updateItem(1, fdMap({ name: "Besi Tua", cost: "100", price: "200" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/besi tua/)
    expect(mocks.prismaMock.item.update).not.toHaveBeenCalled()
  })
})

describe("UoM conversion factorToBase parser", () => {
  const convFd = (rows: unknown) =>
    fdMap({
      name: "Item Test",
      cost: "100",
      price: "200",
      uomConversions: JSON.stringify(rows),
    })

  it("createItem: faktor format Indonesia \"1.000\" terbaca 1000, \"1,5\" terbaca 1.5", async () => {
    const res = await actions.createItem(
      convFd([
        { code: "TON", factorToBase: "1.000" },
        { code: "KG", factorToBase: "1,5" },
      ]),
    )
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.uomConversion.createMany.mock.calls.at(-1)?.[0]
    expect(arg.data).toEqual([
      { itemId: 1, code: "TON", factorToBase: 1000 },
      { itemId: 1, code: "KG", factorToBase: 1.5 },
    ])
  })

  it("updateItem: faktor format Indonesia \"2.000.000\" terbaca 2000000", async () => {
    const res = await actions.updateItem(
      1,
      convFd([{ code: "GRAM", factorToBase: "2.000.000" }]),
    )
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.uomConversion.createMany.mock.calls.at(-1)?.[0]
    expect(arg.data).toEqual([{ itemId: 1, code: "GRAM", factorToBase: 2000000 }])
  })

  it("createItem: faktor tak terbaca ditolak berpesan, tidak ada createMany", async () => {
    const res = await actions.createItem(convFd([{ code: "BOX", factorToBase: "abc" }]))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Faktor konversi satuan")
    expect(mocks.prismaMock.uomConversion.createMany).not.toHaveBeenCalled()
  })

  it("updateItem: faktor 0 ditolak berpesan, konversi lama tidak dihapus", async () => {
    const res = await actions.updateItem(1, convFd([{ code: "BOX", factorToBase: 0 }]))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Faktor konversi satuan")
    expect(mocks.prismaMock.uomConversion.deleteMany).not.toHaveBeenCalled()
  })

  it("baris tanpa kode tetap dibuang tanpa error", async () => {
    const res = await actions.createItem(
      convFd([
        { code: "", factorToBase: "abc" },
        { code: "PCS", factorToBase: 12 },
      ]),
    )
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.uomConversion.createMany.mock.calls.at(-1)?.[0]
    expect(arg.data).toEqual([{ itemId: 1, code: "PCS", factorToBase: 12 }])
  })
})

describe("Warehouse Actions", () => {
  it("createWarehouse succeeds", async () => {
    const res = await actions.createWarehouse(fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updateWarehouse succeeds", async () => {
    const res = await actions.updateWarehouse(1, fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("deleteWarehouse succeeds", async () => {
    const res = await actions.deleteWarehouse(1)
    expect(res?.success).toBe(true)
  })
})

describe("Employee Actions", () => {
  it("createEmployee succeeds", async () => {
    const res = await actions.createEmployee(fdMap({ name: "test", joinDate: "2026-06-13" }))
    expect(res?.success).toBe(true)
  })
  it("updateEmployee succeeds", async () => {
    const res = await actions.updateEmployee(1, fdMap({ name: "test", joinDate: "2026-06-13" }))
    expect(res?.success).toBe(true)
  })
  it("deleteEmployee succeeds", async () => {
    const res = await actions.deleteEmployee(1)
    expect(res?.success).toBe(true)
  })

  // `new Date("2026-02-30")` menggulir diam-diam ke 2 Mar dan string acak
  // jadi Invalid Date — keduanya dulu sampai ke Prisma dari create/update.
  it.each([
    ["joinDate fiktif", { name: "test", joinDate: "2026-02-30" }] as const,
    ["joinDate bukan tanggal", { name: "test", joinDate: "bukan-tanggal" }] as const,
    ["dateOfBirth fiktif", { name: "test", joinDate: "2026-06-13", dateOfBirth: "1990-02-30" }] as const,
  ])("menolak %s di createEmployee dan updateEmployee sebelum tulis DB", async (_label, payload) => {
    const created = await actions.createEmployee(fdMap({ ...payload }))
    expect(created?.success).toBe(false)
    expect(mocks.prismaMock.employee.create).not.toHaveBeenCalled()

    const updated = await actions.updateEmployee(1, fdMap({ ...payload }))
    expect(updated?.success).toBe(false)
    expect(mocks.prismaMock.employee.update).not.toHaveBeenCalled()
  })

  it("menyimpan joinDate/dateOfBirth sebagai tengah malam UTC hari kalender itu", async () => {
    const res = await actions.createEmployee(
      fdMap({ name: "test", joinDate: "2026-01-15", dateOfBirth: "1990-05-20" }),
    )
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.employee.create.mock.calls.at(-1)?.[0]?.data
    expect(data.joinDate.toISOString()).toBe("2026-01-15T00:00:00.000Z")
    expect(data.dateOfBirth.toISOString()).toBe("1990-05-20T00:00:00.000Z")
  })

  it("F-085-S: createEmployee menyimpan status kepegawaian tervalidasi", async () => {
    const res = await actions.createEmployee(fdMap({
      name: "test", joinDate: "2026-01-15",
      employmentStatus: "PKWT", contractEndDate: "2027-01-14",
    }))
    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.employee.create.mock.calls.at(-1)?.[0]?.data
    expect(data.employmentStatus).toBe("PKWT")
    expect(data.contractEndDate.toISOString()).toBe("2027-01-14T00:00:00.000Z")
  })

  it("F-085-S BR-EMP-02: status teks bebas ditolak sebelum tulis DB", async () => {
    const res = await actions.createEmployee(fdMap({
      name: "test", joinDate: "2026-01-15", employmentStatus: "KONTRAK-BEBAS",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Status kepegawaian tidak valid")
    expect(mocks.prismaMock.employee.create).not.toHaveBeenCalled()
  })

  it("F-085-S: employmentEndedAt tanpa endReason ditolak berpasangan", async () => {
    const res = await actions.createEmployee(fdMap({
      name: "test", joinDate: "2026-01-15", employmentEndedAt: "2026-10-15",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("wajib diisi bersamaan")
    expect(mocks.prismaMock.employee.create).not.toHaveBeenCalled()
  })

  it("F-085-S AC-EMP-4: ubah PKWT->PKWTT menulis ActivityLog old/new", async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValue({
      userId: null, employmentStatus: "PKWT",
      contractStartDate: null, contractEndDate: new Date("2026-12-31T00:00:00.000Z"),
      employmentEndedAt: null, endReason: null,
    })
    const res = await actions.updateEmployee(1, fdMap({
      name: "test", joinDate: "2026-06-13", employmentStatus: "PKWTT",
    }))
    expect(res?.success).toBe(true)
    const logArg = mocks.prismaMock.activityLog.create.mock.calls.at(-1)?.[0]
    expect(logArg.data.action).toBe("employee_lifecycle_changed")
    expect(logArg.data.oldValues.employmentStatus).toBe("PKWT")
    expect(logArg.data.newValues.employmentStatus).toBe("PKWTT")
  })
})

describe("Account Actions", () => {
  it("createAccount succeeds", async () => {
    const res = await actions.createAccount(fdMap({ name: "test", code: "test", type: "ASSET", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updateAccount succeeds", async () => {
    mocks.prismaMock.account.findUnique.mockResolvedValueOnce({ code: "TEST", normalBalance: "DEBIT" })
    const res = await actions.updateAccount(1, fdMap({ name: "test", code: "test", type: "ASSET", rate: "10" }))
    expect(res?.success).toBe(true)
  })
})

describe("ItemCategory Actions", () => {
  it("createItemCategory succeeds", async () => {
    const res = await actions.createItemCategory(fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updateItemCategory succeeds", async () => {
    const res = await actions.updateItemCategory(1, fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("deleteItemCategory succeeds", async () => {
    const res = await actions.deleteItemCategory(1)
    expect(res?.success).toBe(true)
  })

  it("deleteItemCategory refuses when the category still has children or items", async () => {
    // items.category_id and item_categories.parent_id are ON DELETE SET NULL —
    // a raw delete silently detaches items and flattens the tree.
    // Children present (both counts share one resolved value here).
    mocks.prismaMock.itemCategory.count.mockResolvedValue(2)
    mocks.prismaMock.item.count.mockResolvedValue(0)
    const childRes = await actions.deleteItemCategory(1)
    expect(childRes?.success).toBe(false)
    expect(childRes?.error).toMatch(/sub-kategori/i)
    expect(mocks.prismaMock.itemCategory.delete).not.toHaveBeenCalled()

    // No children, but items still reference the category.
    mocks.prismaMock.itemCategory.count.mockResolvedValue(0)
    mocks.prismaMock.item.count.mockResolvedValue(3)
    const itemRes = await actions.deleteItemCategory(1)
    expect(itemRes?.success).toBe(false)
    expect(itemRes?.error).toMatch(/barang/i)
    expect(mocks.prismaMock.itemCategory.delete).not.toHaveBeenCalled()
  })
})

describe("Department Actions", () => {
  it("createDepartment succeeds", async () => {
    const res = await actions.createDepartment(fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updateDepartment succeeds", async () => {
    const res = await actions.updateDepartment(1, fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("deleteDepartment succeeds", async () => {
    const res = await actions.deleteDepartment(1)
    expect(res?.success).toBe(true)
  })

  it("deleteDepartment refuses when the department still has positions", async () => {
    // positions.department_id is ON DELETE SET NULL — a raw delete silently
    // detaches every position.
    mocks.prismaMock.position.count.mockResolvedValueOnce(4)
    const res = await actions.deleteDepartment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/jabatan/i)
    expect(mocks.prismaMock.department.delete).not.toHaveBeenCalled()
  })
})

describe("Position Actions", () => {
  it("createPosition succeeds", async () => {
    const res = await actions.createPosition(fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updatePosition succeeds", async () => {
    const res = await actions.updatePosition(1, fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("deletePosition succeeds", async () => {
    const res = await actions.deletePosition(1)
    expect(res?.success).toBe(true)
  })
})

describe("Lead Actions", () => {
  it("createLead succeeds", async () => {
    try {
      await actions.createLead(fdMap({ name: "test", estimatedValue: "100" }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.create).toHaveBeenCalled()
  })
  it("createLead fails validation on negative estimatedValue", async () => {
    const res = await actions.createLead(fdMap({ name: "test", estimatedValue: "-50" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("estimatedValue")
  })
  it("updateLead succeeds", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ id: 1, activities: "[]", assignedTo: 1 })
    try {
      await actions.updateLead(1, fdMap({ name: "test", estimatedValue: "100" }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.update).toHaveBeenCalled()
  })
  it("updateLead fails validation on invalid date", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ id: 1, activities: "[]", assignedTo: 1 })
    const res = await actions.updateLead(1, fdMap({ name: "test", expectedCloseDate: "invalid-date" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("expectedCloseDate")
  })
})

describe("F-2026-10-24-141-S duplikat lead (Model C)", () => {
  const dupRow = {
    id: 11, leadNumber: "LEAD-0011", slug: "budi", name: "Budi",
    company: "PT Sinar", status: "new", customerId: null, assignedTo: 1,
    phone: "+6281234567890", email: "budi@mail.com",
    createdAt: new Date("2026-10-20T00:00:00Z"),
  }

  it("createLead kandidat cocok tanpa alasan -> peringatan, nol baris baru (AC-DUP-1/7)", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([dupRow])
    const res: any = await actions.createLead(fdMap({ name: "Budi Baru", phone: "0812-3456-7890" }))
    expect(res?.success).toBe(false)
    expect(res?.duplicateWarning?.candidates?.map((c: any) => c.id)).toEqual([11])
    expect(mocks.prismaMock.lead.create).not.toHaveBeenCalled()
  })

  it("createLead kandidat cocok + alasan sah -> buat + jejak duplicate_override di lead baru (BR-DUP-06/10)", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([dupRow])
    mocks.prismaMock.lead.create.mockResolvedValue({ id: 55 })
    try {
      await actions.createLead(fdMap({
        name: "Budi Baru", phone: "0812-3456-7890",
        duplicateOverrideReason: "Nomor sentral perusahaan, orang berbeda",
      }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.create).toHaveBeenCalled()
    expect(mocks.prismaMock.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: 55, type: "duplicate_override",
          description: expect.stringContaining("11"),
        }),
      }),
    )
  })

  it("createLead tanpa kandidat -> perilaku existing, tanpa jejak override (AC-DUP-10)", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([])
    try {
      await actions.createLead(fdMap({ name: "Unik", phone: "081299998888" }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.create).toHaveBeenCalled()
    expect(mocks.prismaMock.leadActivity.create).not.toHaveBeenCalled()
  })

  it("createLead company-saja sama -> TIDAK peringatan (AC-DUP-4)", async () => {
    mocks.prismaMock.lead.findMany.mockResolvedValue([
      { ...dupRow, phone: "081200001111", email: "lain@mail.com" },
    ])
    try {
      await actions.createLead(fdMap({ name: "Budi", company: "PT Sinar", phone: "081277778888" }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.create).toHaveBeenCalled()
  })

  it("updateLead ubah phone ke phone lead lain tanpa alasan -> ditolak, nol update (AC-DUP-11)", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({
      id: 1, leadNumber: "LEAD-0001", name: "Saya", assignedTo: 1,
      phone: "081211110000", email: null, status: "new",
    })
    mocks.prismaMock.lead.findMany.mockResolvedValue([dupRow])
    const res: any = await actions.updateLead(1, fdMap({ name: "Saya", phone: "0812-3456-7890" }))
    expect(res?.success).toBe(false)
    expect(res?.duplicateWarning?.candidates?.[0]?.id).toBe(11)
    expect(mocks.prismaMock.lead.update).not.toHaveBeenCalled()
  })

  it("updateLead nomor sama format beda (self) -> TIDAK memicu, update jalan (AC-DUP-11)", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({
      id: 1, leadNumber: "LEAD-0001", name: "Saya", assignedTo: 1,
      phone: "+6281234567890", email: null, status: "new",
    })
    mocks.prismaMock.lead.findMany.mockResolvedValue([dupRow])
    try {
      await actions.updateLead(1, fdMap({ name: "Saya", phone: "0812-3456-7890" }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.update).toHaveBeenCalled()
    expect(mocks.prismaMock.lead.findMany).not.toHaveBeenCalled()
  })

  it("updateLead status-saja nomor tetap -> TIDAK query kandidat (AC-DUP-11)", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({
      id: 1, leadNumber: "LEAD-0001", name: "Saya", assignedTo: 1,
      phone: "081211110000", email: null, status: "new",
    })
    try {
      await actions.updateLead(1, fdMap({ name: "Saya", phone: "081211110000", status: "contacted" }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.update).toHaveBeenCalled()
    expect(mocks.prismaMock.lead.findMany).not.toHaveBeenCalled()
  })
})

describe("Bank Actions", () => {
  it("createBank succeeds", async () => {
    const res = await actions.createBank(fdMap({ name: "test", code: "test", type: "bank", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updateBank succeeds", async () => {
    const res = await actions.updateBank(1, fdMap({ name: "test", code: "test", type: "bank", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("createBank rejects missing code before DB write", async () => {
    const res = await actions.createBank(fdMap({ name: "bank-baru", type: "bank" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.bank.create).not.toHaveBeenCalled()
  })
  it("createBank rejects arbitrary type", async () => {
    const res = await actions.createBank(fdMap({ name: "bank-baru", code: "BNK1", type: "crypto" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.bank.create).not.toHaveBeenCalled()
  })
  it("createBank rejects overlong code", async () => {
    const res = await actions.createBank(fdMap({ name: "bank-baru", code: "X".repeat(51), type: "bank" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.bank.create).not.toHaveBeenCalled()
  })
  it("createBank accepts cash type from quick-add", async () => {
    const res = await actions.createBank(fdMap({ name: "kas-kecil", code: "KAS1", type: "cash" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.bank.create).toHaveBeenCalled()
  })
  it("createBank rejects negative accountId", async () => {
    const res = await actions.createBank(fdMap({ name: "bank-baru", code: "BNK1", type: "bank", accountId: "-5" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.bank.create).not.toHaveBeenCalled()
  })
  it("updateBank rejects arbitrary type before write", async () => {
    const res = await actions.updateBank(1, fdMap({ name: "test", code: "test", type: "crypto" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.bank.update).not.toHaveBeenCalled()
  })
  it("createBank rejects nonexistent accountId", async () => {
    mocks.prismaMock.account.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createBank(fdMap({ name: "bank-baru", code: "BNK1", type: "bank", accountId: "999" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("Akun (COA) tidak ditemukan")
    expect(mocks.prismaMock.bank.create).not.toHaveBeenCalled()
  })
  it("createBank accepts existing accountId", async () => {
    mocks.prismaMock.account.findFirst.mockResolvedValueOnce({ id: 999 })
    const res = await actions.createBank(fdMap({ name: "bank-baru", code: "BNK1", type: "bank", accountId: "999" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.bank.create).toHaveBeenCalled()
  })
  it("updateBank rejects nonexistent accountId before write", async () => {
    mocks.prismaMock.account.findFirst.mockResolvedValueOnce(null)
    const res = await actions.updateBank(1, fdMap({ name: "test", code: "test", type: "bank", accountId: "999" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.bank.update).not.toHaveBeenCalled()
  })
  it("deleteBank succeeds", async () => {
    const res = await actions.deleteBank(1)
    expect(res?.success).toBe(true)
  })
  it("deleteBank menolak bila dipakai rekening koran tanpa menghapus", async () => {
    mocks.prismaMock.bankStatement.count.mockResolvedValueOnce(3)
    const res = await actions.deleteBank(1)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("3 rekening koran")
    expect(mocks.prismaMock.bank.delete).not.toHaveBeenCalled()
  })
})

describe("Uom Actions", () => {
  it("createUom rejects arbitrary category before DB write", async () => {
    const res = await actions.createUom(fdMap({ name: "Piece", symbol: "PCS", category: "crypto" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.unitOfMeasure.create).not.toHaveBeenCalled()
  })
  it("createUom rejects missing symbol before DB write", async () => {
    const res = await actions.createUom(fdMap({ name: "Piece" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.unitOfMeasure.create).not.toHaveBeenCalled()
  })
  it("createUom rejects overlong symbol before DB write", async () => {
    const res = await actions.createUom(fdMap({ name: "Piece", symbol: "X".repeat(51) }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.unitOfMeasure.create).not.toHaveBeenCalled()
  })
  it("createUom accepts jasa category", async () => {
    const res = await actions.createUom(fdMap({ name: "Jam Kerja", symbol: "jam", category: "jasa" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.unitOfMeasure.create).toHaveBeenCalled()
  })
  it("updateUom rejects arbitrary category before DB write", async () => {
    const res = await actions.updateUom(1, fdMap({ name: "Piece", symbol: "PCS", category: "crypto" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.unitOfMeasure.update).not.toHaveBeenCalled()
  })
})

describe("Tax Actions", () => {
  it("createTax succeeds", async () => {
    try {
      await actions.createTax(fdMap({ name: "Tax Test", rate: "10" }))
    } catch { /* redirect throws */ }
    expect(mocks.prismaMock.tax.create).toHaveBeenCalled()
  })
  it("updateTax succeeds", async () => {
    mocks.prismaMock.tax.findUniqueOrThrow.mockResolvedValue({ id: 1 })
    try {
      await actions.updateTax(1, fdMap({ name: "Tax Test", rate: "10" }))
    } catch { /* redirect throws */ }
    expect(mocks.prismaMock.tax.update).toHaveBeenCalled()
  })

  it("updateTax preserves isInclusive/isCompound when the edit form omits them", async () => {
    // The edit form only renders name + rate; writing the checkboxes
    // unconditionally would force them false, silently downgrading the tax.
    try {
      await actions.updateTax(1, fdMap({ name: "PPN", rate: "11" }))
    } catch { /* redirect throws */ }
    const arg = mocks.prismaMock.tax.update.mock.calls.at(-1)?.[0]
    expect(arg.data).not.toHaveProperty("isInclusive")
    expect(arg.data).not.toHaveProperty("isCompound")
  })

  it("updateTax writes isInclusive/isCompound when the form submits them", async () => {
    try {
      await actions.updateTax(1, fdMap({ name: "PPN", rate: "11", isInclusive: "on" }))
    } catch { /* redirect throws */ }
    const arg = mocks.prismaMock.tax.update.mock.calls.at(-1)?.[0]
    expect(arg.data.isInclusive).toBe(true)
    // isCompound was not submitted → preserved (not forced false).
    expect(arg.data).not.toHaveProperty("isCompound")
  })

  it("createTax clamps an out-of-range rate into 0..100", async () => {
    try {
      await actions.createTax(fdMap({ name: "Neg", rate: "-5" }))
    } catch { /* redirect throws */ }
    const arg = mocks.prismaMock.tax.create.mock.calls.at(-1)?.[0]
    expect(arg.data.rate).toBe(0)
  })
  it("createTax rejects fictitious effectiveFrom without creating", async () => {
    const res = await actions.createTax(fdMap({ name: "Fiktif", rate: "11", effectiveFrom: "2026-02-30" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.tax.create).not.toHaveBeenCalled()
  })
  it("createTax rejects oversize description without creating", async () => {
    const res = await actions.createTax(fdMap({ name: "Besar", rate: "11", description: "x".repeat(2001) }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.tax.create).not.toHaveBeenCalled()
  })
  it("createTax stores effectiveFrom as UTC midnight", async () => {
    try {
      await actions.createTax(fdMap({ name: "PPN", rate: "11", effectiveFrom: "2026-10-20" }))
    } catch { /* redirect throws */ }
    const arg = mocks.prismaMock.tax.create.mock.calls.at(-1)?.[0]
    expect(arg.data.effectiveFrom.toISOString()).toBe("2026-10-20T00:00:00.000Z")
  })
  it("updateTax rejects fictitious effectiveTo without updating", async () => {
    const res = await actions.updateTax(1, fdMap({ name: "PPN", rate: "11", effectiveTo: "2026-13-01" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.tax.update).not.toHaveBeenCalled()
  })
  it("deleteTax succeeds", async () => {
    mocks.prismaMock.tax.findUniqueOrThrow.mockResolvedValue({ id: 1, usages: 0 })
    try {
      await actions.deleteTax(1)
    } catch { /* redirect throws */ }
    expect(mocks.prismaMock.tax.delete).toHaveBeenCalled()
  })
})



describe("ItemByScan Actions", () => {
  it("lookupItemByScan succeeds", async () => {
    mocks.prismaMock.barcode.findUnique.mockResolvedValue({ itemId: 42 })
    const res = await actions.lookupItemByScan("test")
    expect(res?.success).toBe(true)
  })

  it("lookupItemByScan mengembalikan slug barang (URL kanonik scan)", async () => {
    mocks.prismaMock.barcode.findUnique.mockResolvedValueOnce({
      itemId: 42,
      item: { slug: "busi-iridium" },
    })
    const res = await actions.lookupItemByScan("8991234567890")
    expect(res?.success).toBe(true)
    expect(res?.id).toBe(42)
    expect(res?.slug).toBe("busi-iridium")
  })

  it("lookupItemByScan via SKU mengembalikan slug barang", async () => {
    mocks.prismaMock.barcode.findUnique.mockResolvedValueOnce(null)
    mocks.prismaMock.item.findFirst.mockResolvedValueOnce({ id: 7, slug: "oli-mesin-1l" })
    const res = await actions.lookupItemByScan("SKU-OLI-1L")
    expect(res?.success).toBe(true)
    expect(res?.id).toBe(7)
    expect(res?.slug).toBe("oli-mesin-1l")
  })
})

describe("Barcode Actions", () => {
  it("createBarcode succeeds", async () => {
    mocks.prismaMock.item.findUnique.mockResolvedValue({ id: 1 })
    const res = await actions.createBarcode(fdMap({ barcode: "1234567890", itemId: "1" }))
    expect(res?.success).toBe(true)
  })
  it("updateBarcode succeeds", async () => {
    mocks.prismaMock.item.findUnique.mockResolvedValue({ id: 1 })
    mocks.prismaMock.barcode.findUniqueOrThrow.mockResolvedValue({ id: 1 })
    const res = await actions.updateBarcode(1, fdMap({ barcode: "1234567890", itemId: "1" }))
    expect(res?.success).toBe(true)
  })
  it("deleteBarcode succeeds", async () => {
    const res = await actions.deleteBarcode(1)
    expect(res?.success).toBe(true)
  })
  it("createBarcode menolak tipe arbitrer tanpa menulis", async () => {
    const res = await actions.createBarcode(fdMap({ barcode: "1234567890", itemId: "1", type: "FREEFORM" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("Tipe barcode")
    expect(mocks.prismaMock.barcode.create).not.toHaveBeenCalled()
  })
  it("createBarcode menolak barcode terlalu panjang tanpa menulis", async () => {
    const res = await actions.createBarcode(fdMap({ barcode: "x".repeat(201), itemId: "1" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.barcode.create).not.toHaveBeenCalled()
  })
  it("createBarcode menolak itemId non-int/tidak ada tanpa menulis", async () => {
    mocks.prismaMock.item.findUnique.mockResolvedValue(null)
    const res = await actions.createBarcode(fdMap({ barcode: "1234567890", itemId: "999" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("Barang")
    expect(mocks.prismaMock.barcode.create).not.toHaveBeenCalled()
  })
  it("updateBarcode menolak tipe arbitrer tanpa menulis", async () => {
    const res = await actions.updateBarcode(1, fdMap({ barcode: "1234567890", itemId: "1", type: "FREEFORM" }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.barcode.update).not.toHaveBeenCalled()
  })
})

describe("TaxGroup Actions", () => {
  it("createTaxGroup succeeds", async () => {
    const fd = new FormData()
    fd.set("name", "test")
    fd.append("taxIds", "1")
    const res = await actions.createTaxGroup(fd)
    expect(res?.success).toBe(true)
  })
  it("updateTaxGroup succeeds", async () => {
    mocks.prismaMock.taxGroup.findUniqueOrThrow.mockResolvedValue({ id: 1, taxes: [] })
    const fd = new FormData()
    fd.set("name", "test")
    fd.append("taxIds", "1")
    const res = await actions.updateTaxGroup(1, fd)
    expect(res?.success).toBe(true)
  })

  it("createTaxGroup menolak taxIds tidak valid tanpa menulis taxGroupTax", async () => {
    const fd = new FormData()
    fd.set("name", "Grup tidak valid")
    fd.append("taxIds", "1")
    fd.append("taxIds", "abc")
    const res = await actions.createTaxGroup(fd)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("pajak yang valid")
    expect(mocks.prismaMock.taxGroup.create).not.toHaveBeenCalled()
  })
  it("createTaxGroup menolak tanpa pajak terpilih", async () => {
    const res = await actions.createTaxGroup(fdMap({ name: "Grup kosong" }))
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("pajak yang valid")
    expect(mocks.prismaMock.taxGroup.create).not.toHaveBeenCalled()
  })
  it("updateTaxGroup menolak taxIds tidak valid tanpa menghapus keanggotaan", async () => {
    const fd = new FormData()
    fd.set("name", "Grup tidak valid")
    fd.append("taxIds", "abc")
    const res = await actions.updateTaxGroup(1, fd)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("pajak yang valid")
    expect(mocks.prismaMock.taxGroupTax.deleteMany).not.toHaveBeenCalled()
  })
  it("deleteTaxGroup succeeds", async () => {
    const res = await actions.deleteTaxGroup(1)
    expect(res?.success).toBe(true)
  })
  it("deleteTaxGroup menghapus keanggotaan lalu grupnya dalam satu transaksi", async () => {
    // Kontrak baru: grup yang berisi pajak TETAP bisa dihapus (dulu ditolak,
    // padahal buat/ubah mewajibkan ≥1 pajak sehingga grup tak pernah bisa
    // dikosongkan — buntu). Keanggotaan dibersihkan lebih dulu.
    mocks.prismaMock.taxGroupTax.count.mockResolvedValueOnce(2)
    const res = await actions.deleteTaxGroup(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.taxGroupTax.deleteMany).toHaveBeenCalledWith({
      where: { taxGroupId: 1 },
    })
    expect(mocks.prismaMock.taxGroup.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})

describe("PaymentTerm Actions", () => {
  it("createPaymentTerm succeeds", async () => {
    const res = await actions.createPaymentTerm(fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("updatePaymentTerm succeeds", async () => {
    const res = await actions.updatePaymentTerm(1, fdMap({ name: "test", code: "test", type: "test", rate: "10" }))
    expect(res?.success).toBe(true)
  })
  it("deletePaymentTerm succeeds", async () => {
    const res = await actions.deletePaymentTerm(1)
    expect(res?.success).toBe(true)
  })
})

describe("Brand Actions", () => {
  it("createBrand succeeds", async () => {
    try {
      await actions.createBrand(fdMap({ name: "BrandTest" }))
    } catch { /* redirect throws */ }
    expect(mocks.prismaMock.brand.create).toHaveBeenCalled()
  })
  it("updateBrand succeeds", async () => {
    mocks.prismaMock.brand.findUniqueOrThrow.mockResolvedValue({ id: 1 })
    try {
      await actions.updateBrand(1, fdMap({ name: "BrandTest" }))
    } catch { /* redirect throws */ }
    expect(mocks.prismaMock.brand.update).toHaveBeenCalled()
  })
  it("deleteBrand succeeds", async () => {
    // Tes kategori di atas mengunci `item.count` ke nilai permanen via
    // mockResolvedValue — reset eksplisit supaya penjagaan melihat 0.
    mocks.prismaMock.item.count.mockResolvedValue(0)
    try {
      await actions.deleteBrand(1)
    } catch { /* redirect throws */ }
    expect(mocks.prismaMock.brand.delete).toHaveBeenCalled()
  })
  it("deleteBrand MENOLAK bila masih dipakai barang", async () => {
    mocks.prismaMock.item.count.mockResolvedValueOnce(5)
    const res = await actions.deleteBrand(1)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/dipakai oleh 5 barang/)
    expect(mocks.prismaMock.brand.delete).not.toHaveBeenCalled()
  })
})


describe('Global Error Paths (Permission Reject for 52 funcs)', () => {
  it("createCustomer handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createCustomer(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateCustomer handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateCustomer(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteCustomer handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteCustomer(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createVendor handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createVendor(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateVendor handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateVendor(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createItem handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createItem(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateItem handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateItem(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createWarehouse handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createWarehouse(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateWarehouse handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateWarehouse(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createEmployee handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createEmployee(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateEmployee handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateEmployee(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createAccount handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createAccount(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createItemCategory handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createItemCategory(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateItemCategory handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateItemCategory(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createDepartment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createDepartment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateDepartment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateDepartment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createPosition handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createPosition(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updatePosition handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updatePosition(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createLead handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createLead(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateLead handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateLead(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createBank handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createBank(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateBank handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateBank(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createTax handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createTax(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateTax handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateTax(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })

  it("lookupItemByScan handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).lookupItemByScan(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createBarcode handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createBarcode(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateBarcode handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateBarcode(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createTaxGroup handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createTaxGroup(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateTaxGroup handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateTaxGroup(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createPaymentTerm handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createPaymentTerm(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updatePaymentTerm handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updatePaymentTerm(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deletePaymentTerm handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deletePaymentTerm(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteVendor handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteVendor(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteItem handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteItem(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteWarehouse handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteWarehouse(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteEmployee handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteEmployee(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteDepartment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteDepartment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deletePosition handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deletePosition(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteBank handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteBank(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteTax handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteTax(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteTaxGroup handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteTaxGroup(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteBarcode handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteBarcode(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteItemCategory handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteItemCategory(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateAccount handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateAccount(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createBrand handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createBrand(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateBrand handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateBrand(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteBrand handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteBrand(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
})

describe('Coverage Hardening Edge Cases', () => {
  it('deleteCustomer - soft delete via P2003', async () => {
    mocks.prismaMock.customer.delete.mockRejectedValueOnce(makeP2003())
    const res = await actions.deleteCustomer(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.customer.update).toHaveBeenCalled()
  })

  it('createCustomer - invalid validation', async () => {
    const res = await actions.createCustomer(fdMap({ name: "" })) // empty name
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
  })

  it('updateCustomer - invalid validation', async () => {
    const res = await actions.updateCustomer(1, fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it('createVendor - invalid validation', async () => {
    const res = await actions.createVendor(fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it('updateVendor - invalid validation', async () => {
    const res = await actions.updateVendor(1, fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it('createItem - validation failure', async () => {
    const res = await actions.createItem(fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it('createItem - cost > price', async () => {
    const res = await actions.createItem(fdMap({ name: "A", cost: "200", price: "100" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Harga jual tidak boleh lebih rendah")
  })

  it('createItem - with uom conversions', async () => {
    const fd = fdMap({ name: "A", cost: "100", price: "200" })
    fd.append("uomConversions", JSON.stringify([{ code: "BOX", factorToBase: 10 }]))
    const res = await actions.createItem(fd)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.uomConversion.createMany).toHaveBeenCalled()
  })

  it('updateItem - validation failure', async () => {
    const res = await actions.updateItem(1, fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it('updateItem - cost > price', async () => {
    const res = await actions.updateItem(1, fdMap({ name: "A", cost: "200", price: "100" }))
    expect(res?.success).toBe(false)
  })

  it('updateItem - with uom conversions', async () => {
    const fd = fdMap({ name: "A", cost: "100", price: "200" })
    fd.append("uomConversions", JSON.stringify([{ code: "BOX", factorToBase: 10 }]))
    const res = await actions.updateItem(1, fd)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.uomConversion.deleteMany).toHaveBeenCalled()
    expect(mocks.prismaMock.uomConversion.createMany).toHaveBeenCalled()
  })

  it('createEmployee - with wantsLogin missing email', async () => {
    const res = await actions.createEmployee(fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Email wajib diisi")
  })

  it('createEmployee - with wantsLogin short password', async () => {
    const res = await actions.createEmployee(fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true", email: "a@a.com", loginPassword: "123" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kata sandi minimal")
  })

  it('createEmployee - with wantsLogin existing user', async () => {
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce({ id: 2 })
    const res = await actions.createEmployee(fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true", email: "a@a.com", loginPassword: "password123" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Email sudah terdaftar")
  })

  it('createEmployee - with wantsLogin success', async () => {
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce(null)
    const fd = fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true", email: "a@a.com", loginPassword: "password123" })
    fd.append("loginRoleIds", "1")
    const res = await actions.createEmployee(fd)
    if (!res?.success) { throw new Error("DEBUG: " + JSON.stringify(res)) }
    expect(res?.success).toBe(true)
  })

  it('updateEmployee - wantsLogin but existing user', async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: 1 })
    const res = await actions.updateEmployee(1, fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true", email: "a@a.com" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah memiliki akun login")
  })

  it('updateEmployee - wantsLogin no email', async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: null })
    const res = await actions.updateEmployee(1, fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Email wajib diisi")
  })

  it('updateEmployee - wantsLogin short password', async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: null })
    const res = await actions.updateEmployee(1, fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true", email: "a@a.com", loginPassword: "123" }))
    expect(res?.success).toBe(false)
  })

  it('updateEmployee - wantsLogin email exists', async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: null })
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce({ id: 2 })
    const res = await actions.updateEmployee(1, fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true", email: "a@a.com", loginPassword: "password123" }))
    expect(res?.success).toBe(false)
  })

  it('updateEmployee - update synced user email exists clash', async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: 1 })
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce({ id: 2 })
    const res = await actions.updateEmployee(1, fdMap({ name: "A", joinDate: "2026-06-13", email: "a@a.com" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Email sudah terdaftar sebagai pengguna lain")
  })

  it('updateEmployee - wantsLogin success', async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: null })
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce(null)
    const fd = fdMap({ name: "A", joinDate: "2026-06-13", createLoginAccount: "true", email: "a@a.com", loginPassword: "password123" })
    fd.append("loginRoleIds", "1")
    const res = await actions.updateEmployee(1, fd)
    if (!res?.success) { throw new Error("DEBUG: " + JSON.stringify(res)) }
    expect(res?.success).toBe(true)
  })

  it('updateEmployee - update synced user success', async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: 1 })
    mocks.prismaMock.user.findUnique.mockResolvedValueOnce(null) // no clash
    const fd = fdMap({ name: "A", joinDate: "2026-06-13", email: "a@a.com" })
    fd.append("loginRoleIds", "1")
    const res = await actions.updateEmployee(1, fd)
    expect(res?.success).toBe(true)
  })

  it('createDepartment - missing code', async () => {
    const res = await actions.createDepartment(fdMap({ name: "test" }))
    expect(res?.success).toBe(true)
  })

  it('createPosition - P2002 conflict fallback', async () => {
    let callCount = 0
    mocks.prismaMock.position.create.mockImplementation(() => {
      callCount++
      if (callCount < 3) {
        throw { code: "P2002", meta: { target: ["code"] } }
      }
      return Promise.resolve({ id: 1 })
    })
    const res = await actions.createPosition(fdMap({ name: "test" }))
    expect(res?.success).toBe(true)
  })

  it('createPosition - P2002 failure', async () => {
    mocks.prismaMock.position.create.mockImplementation(() => {
      throw { code: "P2002", meta: { target: ["code"] } }
    })
    const res = await actions.createPosition(fdMap({ name: "test" }))
    expect(res?.success).toBe(false)
  })

  it('updateLead - not assigned to user and not admin', async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 2, permissions: [], roles: [] })
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, assignedTo: 3 })
    const res = await actions.updateLead(1, fdMap({ name: "test" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Anda hanya dapat mengubah lead")
  })

  it('updateLead - reassigning without admin', async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 2, permissions: [], roles: [] })
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, assignedTo: 2 })
    const res = await actions.updateLead(1, fdMap({ name: "test", assignedTo: "3" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Anda tidak memiliki izin untuk mengubah penugasan")
  })

  it('lookupItemByScan - by sku', async () => {
    mocks.prismaMock.barcode.findUnique.mockResolvedValueOnce(null)
    mocks.prismaMock.item.findFirst.mockResolvedValueOnce({ id: 1 })
    const res = await actions.lookupItemByScan("test")
    expect(res?.success).toBe(true)
    expect(res?.id).toBe(1)
  })

  it('lookupItemByScan - empty', async () => {
    const res = await actions.lookupItemByScan("")
    expect(res?.success).toBe(false)
  })

  it('lookupItemByScan - not found', async () => {
    mocks.prismaMock.barcode.findUnique.mockResolvedValueOnce(null)
    mocks.prismaMock.item.findFirst.mockResolvedValueOnce(null)
    const res = await actions.lookupItemByScan("test")
    expect(res?.success).toBe(false)
  })

  it('createTaxGroup - mapping taxIds', async () => {
    const fd = fdMap({ name: "A" })
    fd.append("taxIds", "1")
    fd.append("taxIds", "2")
    const res = await actions.createTaxGroup(fd)
    expect(res?.success).toBe(true)
  })

  it('updateTaxGroup - mapping taxIds', async () => {
    const fd = fdMap({ name: "A" })
    fd.append("taxIds", "1")
    fd.append("taxIds", "2")
    const res = await actions.updateTaxGroup(1, fd)
    expect(res?.success).toBe(true)
  })

  it('deleteVendor - soft delete', async () => {
    mocks.prismaMock.vendor.delete.mockRejectedValueOnce(makeP2003())
    const res = await actions.deleteVendor(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendor.update).toHaveBeenCalled()
  })

  it('deleteItem - soft delete', async () => {
    mocks.prismaMock.item.delete.mockRejectedValueOnce(makeP2003())
    const res = await actions.deleteItem(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.item.update).toHaveBeenCalled()
  })

  it('deleteWarehouse - soft delete', async () => {
    mocks.prismaMock.warehouse.delete.mockRejectedValueOnce(makeP2003())
    const res = await actions.deleteWarehouse(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.warehouse.update).toHaveBeenCalled()
  })

  it('deleteEmployee - soft delete with userId', async () => {
    mocks.prismaMock.employee.findUnique.mockResolvedValueOnce({ userId: 2 })
    mocks.prismaMock.employee.delete.mockRejectedValueOnce(makeP2003())
    const res = await actions.deleteEmployee(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.employee.update).toHaveBeenCalled()
    expect(mocks.prismaMock.user.update).toHaveBeenCalled()
  })

  it('deleteDepartment - active employees guard', async () => {
    mocks.prismaMock.employee.count.mockResolvedValueOnce(1)
    const res = await actions.deleteDepartment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Departemen masih memiliki")
  })

  it('updateAccount - missing submittedCode loads current', async () => {
    mocks.prismaMock.account.findUnique.mockResolvedValueOnce({ code: "OLD" })
    const res = await actions.updateAccount(1, fdMap({ name: "A", type: "ASSET" }))
    expect(res?.success).toBe(true)
  })

  it('updateAccount - missing submittedCode not found', async () => {
    mocks.prismaMock.account.findUnique.mockResolvedValueOnce(null)
    const res = await actions.updateAccount(1, fdMap({ name: "A", type: "ASSET" }))
    expect(res?.success).toBe(false)
  })

  it('updateAccount - preserves normalBalance when the form omits it', async () => {
    // The AccountForm previously didn't render the normal-balance select, so an
    // edit submitted without it. The action must carry the stored value forward
    // instead of nulling it (which misclassifies the account in every report).
    mocks.prismaMock.account.findUnique.mockResolvedValueOnce({ code: "1000", normalBalance: "DEBIT" })
    const res = await actions.updateAccount(1, fdMap({ name: "Kas", code: "1000", type: "ASSET" }))
    expect(res?.success).toBe(true)
    const updateArg = mocks.prismaMock.account.update.mock.calls.at(-1)?.[0]
    expect(updateArg.data.normalBalance).toBe("DEBIT")
  })

  it('updateItemCategory - preserves parentId and costingMethod when the form omits them', async () => {
    // The edit form renders only name/description. Blindly writing parentId=null
    // / costingMethod="average" would flatten the hierarchy and flip a FIFO
    // category to average on every save.
    const res = await actions.updateItemCategory(1, fdMap({ name: "Kategori" }))
    expect(res?.success).toBe(true)
    const updateArg = mocks.prismaMock.itemCategory.update.mock.calls.at(-1)?.[0]
    expect(updateArg.data).not.toHaveProperty("parentId")
    expect(updateArg.data).not.toHaveProperty("costingMethod")
    expect(updateArg.data.name).toBe("Kategori")
  })

  it("createItemCategory rejects arbitrary costingMethod and missing parent", async () => {
    const badCosting = await actions.createItemCategory(fdMap({ name: "Kat A", costingMethod: "lifo" }))
    expect(badCosting?.success).toBe(false)
    expect(mocks.prismaMock.itemCategory.create).not.toHaveBeenCalled()

    mocks.prismaMock.itemCategory.findUnique.mockResolvedValue(null)
    const badParent = await actions.createItemCategory(fdMap({ name: "Kat B", parentId: "999" }))
    expect(badParent?.success).toBe(false)
    expect(badParent?.error).toMatch(/induk tidak ditemukan/i)
    expect(mocks.prismaMock.itemCategory.create).not.toHaveBeenCalled()
  })

  it("createItemCategory accepts fifo with existing parent", async () => {
    mocks.prismaMock.itemCategory.findUnique.mockResolvedValueOnce({ id: 7 })
    const res = await actions.createItemCategory(fdMap({ name: "Kat C", parentId: "7", costingMethod: "fifo" }))
    expect(res?.success).toBe(true)
    const createArg = mocks.prismaMock.itemCategory.create.mock.calls.at(-1)?.[0]
    expect(createArg.data.costingMethod).toBe("fifo")
    expect(createArg.data.parentId).toBe(7)
  })

  it("updateItemCategory rejects arbitrary costingMethod, self-parent, and cycle", async () => {
    const badCosting = await actions.updateItemCategory(5, fdMap({ name: "Kat", costingMethod: "weird" }))
    expect(badCosting?.success).toBe(false)
    expect(mocks.prismaMock.itemCategory.update).not.toHaveBeenCalled()

    const selfParent = await actions.updateItemCategory(5, fdMap({ name: "Kat", parentId: "5" }))
    expect(selfParent?.success).toBe(false)
    expect(selfParent?.error).toMatch(/dirinya sendiri/i)

    // Parent 9 adalah anak dari 5 -> siklus.
    mocks.prismaMock.itemCategory.findUnique.mockResolvedValueOnce({ id: 9, parentId: 5 })
    const cycle = await actions.updateItemCategory(5, fdMap({ name: "Kat", parentId: "9" }))
    expect(cycle?.success).toBe(false)
    expect(cycle?.error).toMatch(/sub-kategori/i)
    expect(mocks.prismaMock.itemCategory.update).not.toHaveBeenCalled()
  })

  it("itemCategory treats blank parentId/costingMethod as unset", async () => {
    const created = await actions.createItemCategory(fdMap({ name: "Kat D", parentId: "", costingMethod: "" }))
    expect(created?.success).toBe(true)
    const createArg = mocks.prismaMock.itemCategory.create.mock.calls.at(-1)?.[0]
    expect(createArg.data.parentId).toBeNull()
    expect(createArg.data.costingMethod).toBe("average")

    const updated = await actions.updateItemCategory(5, fdMap({ name: "Kat", parentId: "", costingMethod: "" }))
    expect(updated?.success).toBe(true)
    const updateArg = mocks.prismaMock.itemCategory.update.mock.calls.at(-1)?.[0]
    expect(updateArg.data.parentId).toBeNull()
    expect(updateArg.data).not.toHaveProperty("costingMethod")
  })

  it('deleteTax - refuses when the tax is still a member of a tax group', async () => {
    // tax_group_taxes.tax_id has no FK, so a hard delete would silently orphan
    // the group row. The action must guard on membership explicitly.
    mocks.prismaMock.taxGroupTax.count.mockResolvedValueOnce(2)
    const res = await actions.deleteTax(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/kelompok pajak/i)
    expect(mocks.prismaMock.tax.delete).not.toHaveBeenCalled()
  })

})


describe("Coverage completion tests for validation errors", () => {
  it("createAccount validation error", async () => {
    const res = await actions.createAccount(new FormData())
    expect(res?.success).toBe(false)
  })
  it("createItemCategory validation error", async () => {
    const res = await actions.createItemCategory(new FormData())
    expect(res?.success).toBe(false)
  })
  it("updateItemCategory validation error", async () => {
    const res = await actions.updateItemCategory(1, new FormData())
    expect(res?.success).toBe(false)
  })
  it("createDepartment validation error", async () => {
    const res = await actions.createDepartment(new FormData())
    expect(res?.success).toBe(false)
  })
  it("updateDepartment validation error", async () => {
    const res = await actions.updateDepartment(1, new FormData())
    expect(res?.success).toBe(false)
  })
  it("createPosition validation error", async () => {
    const res = await actions.createPosition(new FormData())
    expect(res?.success).toBe(false)
  })
  it("updatePosition validation error", async () => {
    const res = await actions.updatePosition(1, new FormData())
    expect(res?.success).toBe(false)
  })
  it("createBarcode validation error", async () => {
    const res = await actions.createBarcode(new FormData())
    expect(res?.success).toBe(false)
  })
  it("updateBarcode validation error", async () => {
    const res = await actions.updateBarcode(1, new FormData())
    expect(res?.success).toBe(false)
  })
  it("createTaxGroup validation error", async () => {
    const res = await actions.createTaxGroup(new FormData())
    expect(res?.success).toBe(false)
  })
  it("updateTaxGroup validation error", async () => {
    const res = await actions.updateTaxGroup(1, new FormData())
    expect(res?.success).toBe(false)
  })
  it("createPaymentTerm validation error", async () => {
    const res = await actions.createPaymentTerm(new FormData())
    expect(res?.success).toBe(false)
  })
  it("updatePaymentTerm validation error", async () => {
    const res = await actions.updatePaymentTerm(1, new FormData())
    expect(res?.success).toBe(false)
  })
})

describe('Next Redirect Error Handling', () => {
  const methods = [
    actions.createCustomer, actions.updateCustomer, actions.deleteCustomer,
    actions.createVendor, actions.updateVendor,
    actions.createItem, actions.updateItem,
    actions.createWarehouse, actions.updateWarehouse,
    actions.createEmployee, actions.updateEmployee,
    actions.createAccount,
    actions.createItemCategory, actions.updateItemCategory,
    actions.createDepartment, actions.updateDepartment,
    actions.createPosition, actions.updatePosition,
    actions.createLead, actions.updateLead,
    actions.createBank, actions.updateBank,
    actions.createTax, actions.updateTax,
    actions.lookupItemByScan, actions.createBarcode, actions.updateBarcode,
    actions.createTaxGroup, actions.updateTaxGroup,
    actions.createPaymentTerm, actions.updatePaymentTerm
  ];

  for (const method of methods) {
    it(`${method.name} rethrows NextRedirectError`, async () => {
      const e = new Error("redirect");
      (e as any).digest = "NEXT_REDIRECT_test";
      mocks.requirePermissionMock.mockRejectedValueOnce(e);
      await expect((method as any)(new FormData(), new FormData())).rejects.toThrow();
    });
  }
});

describe('hardDeleteOrSoftDelete Edge Cases', () => {
  it('throws non-P2003 error', async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 1, permissions: [] });
    mocks.prismaMock.customer.delete.mockRejectedValueOnce(new Error("Random Error"));
    const res = await actions.deleteCustomer(1);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Random Error");
  });

  it('handles P2003 error by soft deleting', async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 1, permissions: [] });
    mocks.prismaMock.customer.delete.mockRejectedValueOnce(makeP2003());
    mocks.prismaMock.customer.update.mockResolvedValueOnce({ id: 1 });
    const res = await actions.deleteCustomer(1);
    expect(res.success).toBe(true);
    expect(mocks.prismaMock.customer.update).toHaveBeenCalled();
  });
});

describe('Zod Validation Coverage in master.actions', () => {
  it('createWarehouse blocks empty name', async () => {
    const fd = new FormData()
    const res = await actions.createWarehouse(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Validasi gagal/)
    expect(mocks.prismaMock.warehouse.create).not.toHaveBeenCalled()
  })

  it('updateWarehouse blocks empty name', async () => {
    const fd = new FormData()
    const res = await actions.updateWarehouse(1, fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Validasi gagal/)
    expect(mocks.prismaMock.warehouse.update).not.toHaveBeenCalled()
  })

  it('createAccount blocks invalid type', async () => {
    const fd = new FormData()
    fd.append('name', 'BOGUS')
    fd.append('type', 'BOGUS_TYPE')
    const res = await actions.createAccount(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Validasi gagal/)
    expect(mocks.prismaMock.account.create).not.toHaveBeenCalled()
  })

  it('updateAccount blocks invalid type', async () => {
    const fd = new FormData()
    fd.append('name', 'BOGUS')
    fd.append('type', 'BOGUS_TYPE')
    const res = await actions.updateAccount(1, fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Validasi gagal/)
    expect(mocks.prismaMock.account.update).not.toHaveBeenCalled()
  })
})

describe("F-2026-10-25-030-S alasan kalah lead lost (Q-LR-1..4)", () => {
  const baseLead = {
    id: 1, leadNumber: "LEAD-0001", name: "Saya", assignedTo: 1,
    phone: null, email: null, status: "new",
  }

  it("AC-LR-B1: transisi ke lost tanpa kategori ditolak, status utuh", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead })
    const res: any = await actions.updateLead(1, fdMap({ name: "Saya", status: "lost" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("wajib dipilih")
    expect(mocks.prismaMock.lead.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.leadActivity.create).not.toHaveBeenCalled()
  })

  it("AC-LR-B2: key asing (kamus quotation) ditolak eksplisit", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead })
    const res: any = await actions.updateLead(
      1,
      fdMap({ name: "Saya", status: "lost", lostReasonCategory: "pilih-bengkel-lain" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("Kategori alasan kalah tidak dikenal")
    expect(mocks.prismaMock.lead.update).not.toHaveBeenCalled()
  })

  it("AC-LR-B3: transisi sah menulis tepat satu status_change berawalan [kalah:key]", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead })
    try {
      await actions.updateLead(
        1,
        fdMap({ name: "Saya", status: "lost", lostReasonCategory: "harga", lostReasonText: "kemahalan" }),
      )
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.update).toHaveBeenCalledTimes(1)
    const statusChanges = mocks.prismaMock.leadActivity.create.mock.calls.filter(
      (c: any[]) => c[0]?.data?.type === "status_change",
    )
    expect(statusChanges).toHaveLength(1)
    expect(statusChanges[0][0].data).toMatchObject({
      leadId: 1,
      oldStatus: "new",
      newStatus: "lost",
      description: "[kalah:harga] kemahalan",
    })
  })

  it("Q-LR-2: kategori lainnya + teks kosong sah", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead })
    try {
      await actions.updateLead(1, fdMap({ name: "Saya", status: "lost", lostReasonCategory: "lainnya" }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.update).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: "[kalah:lainnya]" }),
      }),
    )
  })

  it("AC-LR-B5: won -> lost ditolak; lost -> aktif ditolak (terminal Q-LR-4)", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead, status: "won" })
    const resWon: any = await actions.updateLead(
      1,
      fdMap({ name: "Saya", status: "lost", lostReasonCategory: "budget" }),
    )
    expect(resWon?.success).toBe(false)
    expect(resWon?.error).toContain("terminal")
    expect(mocks.prismaMock.lead.update).not.toHaveBeenCalled()

    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead, status: "lost" })
    const resLost: any = await actions.updateLead(1, fdMap({ name: "Saya", status: "new" }))
    expect(resLost?.success).toBe(false)
    expect(resLost?.error).toContain("terminal")
    expect(mocks.prismaMock.lead.update).not.toHaveBeenCalled()
  })

  it("kategori pada status non-lost ditolak", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead })
    const res: any = await actions.updateLead(
      1,
      fdMap({ name: "Saya", status: "contacted", lostReasonCategory: "budget" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya berlaku")
    expect(mocks.prismaMock.lead.update).not.toHaveBeenCalled()
  })

  it("transisi status non-lost existing tetap jalan tanpa description alasan", async () => {
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead })
    try {
      await actions.updateLead(1, fdMap({ name: "Saya", status: "contacted" }))
    } catch { /* redirect */ }
    expect(mocks.prismaMock.lead.update).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "status_change", description: null }),
      }),
    )
  })

  it("AC-LR-B6: non-admin lead orang lain + lost tetap ditolak guard kepemilikan", async () => {
    mocks.requirePermissionMock.mockResolvedValueOnce({ id: 2, permissions: [], roles: [] })
    mocks.prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ ...baseLead, assignedTo: 3 })
    const res: any = await actions.updateLead(
      1,
      fdMap({ name: "Saya", status: "lost", lostReasonCategory: "budget" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Anda hanya dapat mengubah lead")
    expect(mocks.prismaMock.lead.update).not.toHaveBeenCalled()
  })

  it("AC-LR-F1 (server): kamus payload server LEAD_LOST_REASON_CATEGORIES = 8 key Q-LR-1", () => {
    expect(LEAD_LOST_REASON_CATEGORIES.map((c) => c.key)).toEqual([
      "budget",
      "harga",
      "waktu",
      "tidak-ada-respons",
      "kalah-kompetitor",
      "bukan-target",
      "pembatalan",
      "lainnya",
    ])
  })
})
