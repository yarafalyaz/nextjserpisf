import { z } from "zod"
import "./zod-locale";

const optionalId = z.coerce.number().int().min(1).optional()

export const withholdingTaxTypeSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi").max(50),
  name: z.string().min(1, "Nama wajib diisi").max(200),
  rate: z.coerce.number().min(0, "Tarif minimal 0").max(100, "Tarif maksimal 100").default(0),
  // Pasal wajib dikenal service terbit bupot (assertArticle): jenis tanpa
  // pasal tidak pernah bisa diterbitkan. Opsional di master (jenis legacy
  // pra-kolom ini tetap tersimpan; terbit yang menolaknya).
  article: z
    .enum(["PPh21", "PPh22", "PPh23", "PPh4(2)", "PPh26", "PPh15"], {
      message: "Pasal tidak dikenal (PPh21|PPh22|PPh23|PPh4(2)|PPh26|PPh15)",
    })
    .optional(),
  objectCode: z.string().trim().max(50).optional(),
  liabilityAccountId: optionalId,
  receivableAccountId: optionalId,
  isActive: z
    .union([z.boolean(), z.literal("true"), z.literal("false"), z.literal("on")])
    .optional()
    .transform((v) => v === true || v === "true" || v === "on"),
})

