import { z } from "zod"
import { parseMoneyAmount } from "@/lib/utils/parse-money"
import { dateOnly } from "@/lib/validations/finance.schemas"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalDateOnly = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
)

/**
 * F-PRICELIST-01 tahap 1: satu baris daftar harga jual.
 * `customerCategoryId` kosong = harga per item berlaku semua kategori.
 * Sengaja TANPA aturan qty/promo/minimum (tahap 2, di luar putusan).
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
  effectiveDate: optionalDateOnly,
  notes: optionalString(2000),
})
