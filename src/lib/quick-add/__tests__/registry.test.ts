// @vitest-environment node
import { describe, it, expect, vi } from "vitest"

// The registry statically imports server actions (which transitively pull
// next-auth/next-server, unavailable in a pure unit environment). Only the
// shape of QUICK_ADD matters here, so stub the action modules.
vi.mock("@/actions/master.actions", () => ({ createAccount: vi.fn(), createBank: vi.fn(), createBrand: vi.fn(), createCustomer: vi.fn(), createCustomerCategory: vi.fn(), createDepartment: vi.fn(), createEmployee: vi.fn(), createItemCategory: vi.fn(), createPaymentTerm: vi.fn(), createPosition: vi.fn(), createTax: vi.fn(), createUom: vi.fn(), createVendor: vi.fn(), createWarehouse: vi.fn(), listCustomerCategoryOptions: vi.fn() }))
vi.mock("@/actions/method.actions", () => ({ createPaymentMethod: vi.fn(), createShippingMethod: vi.fn() }))
vi.mock("@/actions/finance.actions", () => ({ createCostCenter: vi.fn() }))
vi.mock("@/actions/vehicle.actions", () => ({
  createCustomerVehicle: vi.fn(),
  listVehicleVariantOptions: vi.fn(),
}))

import { QUICK_ADD, type QuickAddDefinition } from "@/lib/quick-add/registry"
import type { QuickAddField } from "@/components/ui/quick-add-select"

/**
 * Guards the declarative quick-add registry. Every entry must be usable by
 * QuickAddSelect: a title, a callable action, and a `name` field (the dialog
 * uses `name` for the default label and the toast). A new entity added without
 * these would fail at click time, not build time — this test closes that gap.
 */
describe("QUICK_ADD registry", () => {
  // The registry uses `satisfies`, so each entry keeps its narrow literal field
  // shape. Widen to the declared interface so the optional `options` /
  // `defaultValue` properties are visible when iterating.
  const entries = Object.entries(QUICK_ADD) as [string, QuickAddDefinition][]

  it("is not empty", () => {
    expect(entries.length).toBeGreaterThan(10)
  })

  it.each(entries)("%s has a title, action and fields", (_key, def) => {
    expect(typeof def.title).toBe("string")
    expect(def.title.length).toBeGreaterThan(0)
    expect(typeof def.action).toBe("function")
    expect(Array.isArray(def.fields)).toBe(true)
    expect(def.fields.length).toBeGreaterThan(0)
  })

  it.each(entries)("%s punya sumber label: field `name` (wajib) atau getLabel", (_key, def) => {
    // Dialog memakai `name` untuk label default baris baru; entitas tanpa field `name`
    // (mis. Kendaraan Pelanggan) harus menyediakan `getLabel` sendiri.
    const hasNameField = def.fields[0]?.name === "name" && def.fields[0]?.required === true
    const hasGetLabel = typeof def.getLabel === "function"
    expect(hasNameField || hasGetLabel, `${_key} tanpa sumber label`).toBe(true)
  })

  it.each(entries)("%s select/combobox fields declare a source of choices", (_key, def) => {
    for (const field of def.fields as QuickAddField[]) {
      if (field.type !== "select" && field.type !== "combobox") continue
      // Pilihan boleh statis (`options`) atau dibaca dari database saat dialog dibuka
      // (`loadOptions` — dipakai Kategori Pelanggan supaya daftarnya tidak kedaluwarsa).
      const fromDatabase = Boolean(field.loadOptions)
      expect(fromDatabase || (field.options ?? []).length > 0, `${_key}.${field.name}`).toBe(true)
      if (field.required && field.type === "select") {
        // Select uncontrolled harus punya default supaya form tetap mengirim nilai walau
        // pengguna tidak menyentuhnya. Combobox tidak perlu: nilainya dari state dan
        // field wajibnya divalidasi di handleSubmit (input hidden tak kena `required`).
        expect(field.defaultValue, `${_key}.${field.name} wajib punya default`).toBeDefined()
      }
    }
  })

  it.each(entries)("%s labels every field", (_key, def) => {
    for (const field of def.fields as QuickAddField[]) {
      expect(field.label, `${_key}.${field.name}`).toBeTruthy()
    }
  })
})

/**
 * Quick-add pelanggan dulu hanya meminta nama/telepon/email, sehingga hasilnya jauh
 * berbeda dari form "Tambah Pelanggan" penuh (tanpa kategori, NPWP, alamat, wilayah).
 * Tes ini mengunci kesetaraan field-nya supaya tidak menyusut lagi tanpa sengaja.
 */
describe("quick-add pelanggan", () => {
  const fields = QUICK_ADD.customer.fields as QuickAddField[]
  const names = fields.map((f) => f.name)

  it("meminta field yang sama dengan form Tambah Pelanggan", () => {
    for (const expected of [
      "name",
      "customerCategoryId",
      "email",
      "phone",
      "taxId",
      "gender",
      "address",
      "region",
    ]) {
      expect(names, `field ${expected}`).toContain(expected)
    }
  })

  it("kategori dibaca dari database, bukan daftar statis", () => {
    const category = fields.find((f) => f.name === "customerCategoryId")
    expect(category?.type).toBe("select")
    expect(typeof category?.loadOptions).toBe("function")
  })

  it("wilayah memakai pemilih bertingkat (region), bukan input bebas", () => {
    expect(fields.find((f) => f.name === "region")?.type).toBe("region")
  })

  it("field panjang memakai lebar penuh di dialog dua kolom", () => {
    // Dialog pelanggan dirender dua kolom (field > 4); alamat & wilayah harus
    // mengambil satu baris penuh supaya tidak terpotong.
    expect(fields.find((f) => f.name === "address")?.span).toBe("full")
    expect(fields.find((f) => f.name === "region")?.span).toBe("full")
  })

  it("jenis kelamin memakai nilai enum yang diterima skema pelanggan", () => {
    const gender = fields.find((f) => f.name === "gender")
    // `customerSchema` memakai z.enum(["male","female"]); GENDER_CHOICES di
    // option-group.tsx memakai pasangan yang sama untuk pelanggan & karyawan.
    expect((gender?.options ?? []).map((o) => o.value)).toEqual(["male", "female"])
  })
})

/**
 * Kendaraan pelanggan: quick-add dulu tidak ada sama sekali, sehingga kendaraan baru
 * hanya bisa ditambah dari halaman detail pelanggan (pindah halaman di tengah dokumen).
 */
describe("quick-add kendaraan pelanggan", () => {
  const fields = QUICK_ADD.customerVehicle.fields as QuickAddField[]
  const byName = (name: string) => fields.find((f) => f.name === name)

  it("menerima pelanggan lewat hidden field (disuntik extraValues pemanggil)", () => {
    expect(byName("customerId")?.type).toBe("hidden")
  })

  it("tipe kendaraan wajib dan dicari dari katalog varian", () => {
    const variant = byName("variantId")
    expect(variant?.type).toBe("combobox")
    expect(variant?.required).toBe(true)
    expect(typeof variant?.loadOptions).toBe("function")
  })

  it("mengumpulkan identitas fisik kendaraan seperti form penuh", () => {
    for (const name of ["plateNumber", "year", "color", "chassisNumber", "engineNumber", "notes"]) {
      expect(byName(name), name).toBeTruthy()
    }
  })

  it("menyediakan label baris dari plat nomor", () => {
    const fd = new FormData()
    fd.set("plateNumber", "B 1234 XYZ")
    expect(QUICK_ADD.customerVehicle.getLabel?.(fd)).toBe("B 1234 XYZ")
  })
})
