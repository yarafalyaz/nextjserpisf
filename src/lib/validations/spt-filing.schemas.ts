import { z } from "zod"

export const SPT_TYPE_VALUES = ["ppn", "pph21", "unifikasi", "tahunan"] as const
export type SptType = (typeof SPT_TYPE_VALUES)[number]

export const SPT_TYPE_LABELS: Record<SptType, string> = {
  ppn: "SPT Masa PPN",
  pph21: "SPT Masa PPh 21/26",
  unifikasi: "SPT Masa PPh Unifikasi",
  tahunan: "SPT Tahunan",
}

const optionalId = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return null
  const num = Number(val)
  return Number.isFinite(num) ? num : val
}, z.number().int().positive().nullable().optional())

const optionalText = (maxLen: number) =>
  z.preprocess(
    (val) => (typeof val === "string" ? val.trim() || null : val ?? null),
    z.string().max(maxLen).nullable().optional(),
  )

export const sptFilingSchema = z
  .object({
    sptType: z.enum(SPT_TYPE_VALUES, {
      message: "Jenis SPT harus dipilih (ppn, pph21, unifikasi, atau tahunan).",
    }),
    period: z.string().trim().min(4, "Masa pajak wajib diisi.").max(7),
    amendmentNo: z.coerce
      .number()
      .int("Nomor pembetulan harus bilangan bulat.")
      .min(0, "Nomor pembetulan minimal 0 (Normal).")
      .max(99, "Nomor pembetulan maksimal 99."),
    filedAt: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal lapor harus berformat YYYY-MM-DD."),
    bpeNumber: z
      .string()
      .trim()
      .min(3, "Nomor BPE wajib diisi minimal 3 karakter.")
      .max(100, "Nomor BPE maksimal 100 karakter."),
    underOverPayment: z.coerce
      .number()
      .finite("Kurang/lebih bayar harus berupa angka valid."),
    compensationBalance: z.coerce
      .number()
      .finite("Saldo kompensasi Coretax harus berupa angka valid."),
    taxPaymentId: optionalId,
    varianceNote: optionalText(2000),
  })
  .superRefine((data, ctx) => {
    if (data.sptType === "tahunan") {
      if (!/^(20\d{2})$/.test(data.period)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["period"],
          message: "Masa SPT Tahunan harus berformat tahun 4 digit (YYYY, mis. 2026).",
        })
      }
      return
    }
    const match = /^(\d{4})-(\d{2})$/.exec(data.period)
    if (!match) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["period"],
        message: "Masa SPT Masa harus berformat YYYY-MM (mis. 2026-10).",
      })
      return
    }
    const month = Number(match[2])
    if (month < 1 || month > 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["period"],
        message: "Bulan pada masa pajak harus antara 01 sampai 12.",
      })
    }
  })

export type SptFilingInput = z.infer<typeof sptFilingSchema>
