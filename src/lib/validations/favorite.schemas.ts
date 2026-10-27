import { z } from "zod"
import "./zod-locale";

import { normalizeFavoriteHref } from "@/lib/utils/favorite-href"

/**
 * `label`/`href` dulu hand-parse di favorite.actions tanpa max-length:
 * kolom String polos bisa ditanami baris multi-MB. `href` tetap lewat
 * `normalizeFavoriteHref` (fail-closed: hanya jalur internal) — di sini
 * diperkuat sebagai refine supaya penolakan ikut format error Zod.
 */
export const favoriteTransactionSchema = z.object({
  label: z.string().min(1, "Nama pintasan wajib diisi").max(200),
  href: z
    .string()
    .max(500)
    .transform((v) => normalizeFavoriteHref(v))
    .refine((v): v is string => v !== null, {
      message: "Tautan harus berupa jalur internal aplikasi, mis. /penjualan/faktur/tambah",
    }),
})
