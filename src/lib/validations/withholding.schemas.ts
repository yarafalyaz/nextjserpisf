import { z } from "zod"
import "./zod-locale";

const optionalId = z.coerce.number().int().min(1).optional()

export const withholdingTaxTypeSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi").max(50),
  name: z.string().min(1, "Nama wajib diisi").max(200),
  rate: z.coerce.number().min(0, "Tarif minimal 0").max(100, "Tarif maksimal 100").default(0),
  liabilityAccountId: optionalId,
  receivableAccountId: optionalId,
  isActive: z
    .union([z.boolean(), z.literal("true"), z.literal("false"), z.literal("on")])
    .optional()
    .transform((v) => v === true || v === "true" || v === "on"),
})

