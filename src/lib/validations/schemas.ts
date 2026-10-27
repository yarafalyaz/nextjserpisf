import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

const optionalBoolean = z.boolean().optional()

export const customerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  email: z.string().email("Email tidak valid").max(100).optional().or(z.literal("").transform(() => undefined)),
  phone: optionalString(30),
  address: optionalString(200),
  city: optionalString(200),
  street: optionalString(200),
  province: optionalString(200),
  district: optionalString(200),
  village: optionalString(200),
  postalCode: optionalString(200),
  contactPerson: optionalString(100),
  gender: z.enum(["male", "female"]).optional(),
  code: optionalString(50),
  taxId: optionalString(50),
  // F-2026-10-25-004-S: blok identitas pajak (semua opsional; bentuk
  // NPWP/NITKU divalidasi service-layer builder, bukan di skema ini).
  taxpayerName: optionalString(200),
  taxAddress: optionalString(2000),
  nitku: optionalString(50),
  pkpStatus: z.enum(["non_pkp", "pkp", "unknown"]).optional(),
  pkpEffectiveFrom: optionalString(10),
  pkpSource: optionalString(200),
  customerCategoryId: optionalNumber(),
})

export const customerCategorySchema = z.object({
  name: z.string().min(1, "Nama kategori wajib diisi").max(200),
  downPaymentPercent: z.coerce.number().min(0, "Persentase minimal 0").max(100, "Persentase maksimal 100").default(0),
})

export const vendorSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  email: z.string().email("Email tidak valid").max(100).optional().or(z.literal("").transform(() => undefined)),
  phone: optionalString(30),
  address: optionalString(200),
  city: optionalString(200),
  street: optionalString(200),
  province: optionalString(200),
  postalCode: optionalString(200),
  districtVendor: optionalString(200),
  villageVendor: optionalString(200),
  npwp: optionalString(200),
  contactPerson: optionalString(100),
  paymentTermId: optionalNumber(),
  bankName: optionalString(100),
  bankAccountNumber: optionalString(100),
  bankAccountHolder: optionalString(100),
  code: optionalString(50),
})

export const itemSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  description: optionalString(500),
  sku: optionalString(50),
  categoryId: optionalNumber(),
  groupId: optionalNumber(),
  brandId: optionalNumber(),
  vendorId: optionalNumber(),
  defaultWarehouseId: optionalNumber(),
  defaultRackId: optionalNumber(),
  defaultRackRowId: optionalNumber(),
  unitOfMeasure: z.string().max(20).default("PCS"),
  minStock: optionalNumber(0),
  cost: z.coerce.number().min(0, "Harga beli minimal 0"),
  price: z.coerce.number().min(0, "Harga jual minimal 0"),
  standardCost: optionalNumber(0),
  purchasePrice: optionalNumber(0),
  costingMethod: z
    .preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.enum(["fifo", "average"], { message: "Metode penilaian harus fifo atau average" }),
    )
    .optional(),
  isProduct: optionalBoolean,
  isService: optionalBoolean,
  // F-2026-10-25-042-V (vonis Q-ITX-1): default pajak per item — FK nullable
  // ke Tax per arah + persen DPP Decimal(5,2). Kosong/null = existing
  // byte-sama. Penjaga scrap + rentang 0–100 + rujukan aktif di service
  // item-tax-default (fail-closed), bukan di skema ini.
  defaultSalesTaxId: optionalNumber(),
  defaultPurchaseTaxId: optionalNumber(),
  defaultDppPercent: optionalNumber(),
  // F-2026-10-24-135-V: penanda item besi tua (dijual lewat faktur existing,
  // pendapatan lain-lain fail-closed, COGS Rp0).
  isScrapSaleItem: optionalBoolean,
  trackBatch: optionalBoolean,
  trackSerial: optionalBoolean,
  image: z.string().optional(),
})

// Server-action variants of the master data schemas. They mirror the form
// schemas in @/lib/validations/form.schemas.ts but add z.coerce.number() for the
// numeric fields, because FormData entries arrive as strings and the shared
// form schemas assume react-hook-form has already coerced the values. Using
// these in the server actions closes the Zod validation bypass (e.g. an
// authenticated editor posting an arbitrary account `type` cast through
// `as "ASSET" | "LIABILITY" | ...`, which would silently corrupt the chart
// of accounts and the balance sheet / income statement / trial balance
// grouping).
export const warehouseServerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  code: optionalString(50),
  address: optionalString(500),
})

const optionalDateOnly = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  // String YYYY-MM-DD kalender-valid; action konversi via wibDateToUtcMidnight.
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (format YYYY-MM-DD)")
    .refine((value) => {
      const [y, m, d] = value.split("-").map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d))
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    }, "Tanggal tidak valid")
    .optional(),
)

export const taxServerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  // Tetap di-clamp 0..100 di action (perilaku historis); skema hanya menolak non-angka.
  rate: z.coerce.number({ message: "Tarif harus berupa angka" }),
  code: optionalString(50),
  description: optionalString(2000),
  type: optionalString(50),
  scope: optionalString(50),
  effectiveFrom: optionalDateOnly,
  effectiveTo: optionalDateOnly,
})

export const employeeDatesSchema = z.object({
  // `new Date("2026-02-30")` menggulir ke 2 Mar; konversi lewat wibDateToUtcMidnight.
  joinDate: z
    .string({ message: "Tanggal masuk wajib diisi" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal masuk tidak valid (format YYYY-MM-DD)")
    .refine((value) => {
      const [y, m, d] = value.split("-").map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d))
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    }, "Tanggal masuk tidak valid"),
  dateOfBirth: optionalDateOnly,
  // F-2026-10-22-085-S: tanggal siklus hidup opsional (kosong = tidak diatur).
  contractStartDate: optionalDateOnly,
  contractEndDate: optionalDateOnly,
  employmentEndedAt: optionalDateOnly,
  leaveEligibilityStartDate: optionalDateOnly,
})

export const uomServerSchema = z.object({
  name: z.string().min(1, "Nama satuan wajib diisi").max(200),
  // Quick-add hanya kirim name+symbol; form master kirim barang/jasa.
  // Nilai lain = tamper klien, tolak sebelum DB (dulu senyap jadi barang).
  symbol: z.string().min(1, "Simbol wajib diisi").max(50),
  category: z.enum(["barang", "jasa"], { message: "Jenis harus barang atau jasa" }).default("barang"),
})

export const bankServerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  // `banks.code` kolom @unique wajib di schema (NOT NULL); dulu hand-parse lolos null -> P2011/P2002 mentah.
  code: z.string().min(1, "Kode wajib diisi").max(50),
  // Nilai yang di-render form master bank + quick-add (satu-satunya produsen data);
  // `cash` = rek kas dari quick-add. Nilai lain = tamper klien, tolak sebelum DB.
  type: z.enum(["bank", "emoney", "cash"], { message: "Tipe harus bank, emoney, atau kas" }).default("bank"),
  accountId: z.coerce.number().int("Akun (COA) tidak valid").positive("Akun (COA) tidak valid").optional(),
})

export const itemCategoryServerSchema = z.object({
  name: z.string({ message: "Nama wajib diisi" }).min(1, "Nama wajib diisi").max(200),
  description: optionalString(2000),
  // Dulu hand-parse: string bebas tersimpan lalu resolver HPP jatuh diam-diam
  // ke fifo (costing-method.service), dan parentId mentah memicu P2003/siklus.
  // Kosong dari form = tidak diisi (create: tanpa induk; update: lepas induk).
  parentId: z
    .preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().int("Kategori induk tidak valid").positive("Kategori induk tidak valid"),
    )
    .optional(),
  costingMethod: z
    .preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.enum(["fifo", "average"], { message: "Metode penilaian harus fifo atau average" }),
    )
    .optional(),
})

export const accountServerSchema = z.object({
  code: optionalString(50),
  name: z.string().min(1, "Nama akun wajib diisi").max(200),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"], {
    message: "Tipe akun harus salah satu dari ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
  }),
  parentId: optionalNumber(),
  description: optionalString(1000),
  // The account-form renders a "Saldo Normal" select (DEBIT/CREDIT) and writes
  // it to a form field, but the previous schema dropped it. The Account model
  // column is required by every report/filter (trial balance, financial
  // statements) — an unset value silently misclassifies the account.
  normalBalance: z
    .enum(["DEBIT", "CREDIT"], {
      message: "Saldo normal harus DEBIT atau CREDIT",
    })
    .optional(),
})

// Form barcode (tambah + ubah) cuma render 6 tipe ini; dulu action pakai
// `String(formData.get("type")) || "EAN13"` sehingga tipe arbitrer dan barcode
// tanpa batas panjang lolos ke DB. Samakan dengan produsen UI.
export const barcodeServerSchema = z.object({
  barcode: z.string().min(1, "Barcode wajib diisi").max(200),
  itemId: z.coerce.number().int("ID barang tidak valid").positive("ID barang tidak valid"),
  type: z
    .enum(["EAN13", "EAN8", "UPC", "CODE128", "CODE39", "QR"], {
      message: "Tipe barcode harus salah satu dari EAN13, EAN8, UPC, CODE128, CODE39, QR",
    })
    .default("EAN13"),
})

