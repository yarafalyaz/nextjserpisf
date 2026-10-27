import { z } from "zod"
import "./zod-locale";
import { parseLocaleNumber, parseMoneyAmount } from "@/lib/utils/parse-money"
import { dateOnly } from "@/lib/validations/finance.schemas"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalDateOnly = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
)

/**
 * F-PRICELIST-01 tahap 1 + F-2026-10-21-018: satu baris daftar harga jual.
 * `customerCategoryId` kosong = harga per item berlaku semua kategori.
 * `minQty` = ambang qty INKLUSIF (BR-TIER-01); kosong -> 1.
 */
export const customerPriceListSchema = z.object({
  customerCategoryId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce
      .number({ message: "Kategori pelanggan tidak valid" })
      .int()
      .positive("Kategori pelanggan tidak valid")
      .optional(),
  ),
  itemId: z.coerce
    .number({ message: "Barang wajib dipilih" })
    .int()
    .positive("Barang wajib dipilih"),
  price: z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce
      .number({ message: "Harga wajib diisi" })
      .positive("Harga harus lebih dari 0")
      .max(1_000_000_000_000, "Harga melebihi batas"),
  ),
  // Pola vendorPriceSchema.minQty: parse locale sadar ("1.000" = 1000),
  // kosong/tak-terbaca -> 1; wajib > 0 (data rusak dicegah di gerbang).
  minQty: z.preprocess(
    (v) => (typeof v === "string" ? (parseLocaleNumber(v) ?? 1) : v),
    z.coerce
      .number({ message: "Minimal qty tidak valid" })
      .positive("Minimal qty harus lebih dari 0")
      .max(1_000_000_000, "Minimal qty melebihi batas"),
  ),
  effectiveDate: optionalDateOnly,
  // F-2026-10-25-001-S BR-PX-01/06: tanggal berakhir opsional (date-only sama).
  expiresAt: optionalDateOnly,
  notes: optionalString(2000),
}).superRefine((v, ctx) => {
  // BR-PX-06: tanggalBerakhir >= effectiveDate bila keduanya diisi (date-only
  // YYYY-MM-DD terurut leksikografis = terurut kalender).
  if (v.effectiveDate && v.expiresAt && v.expiresAt < v.effectiveDate) {
    ctx.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: `Tanggal berakhir (${v.expiresAt}) tidak boleh sebelum tanggal efektif (${v.effectiveDate}).`,
    })
  }
})
