import { z } from "zod"
import "./zod-locale";
import { dateOnly } from "@/lib/validations/finance.schemas"
import { parseMoneyAmount } from "@/lib/utils/parse-money"

const optionalId = z.coerce.number().int().min(1).optional()

export const recurringTransactionSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(200),
  type: z.enum(["journal", "expense"], { message: "Jenis transaksi wajib dipilih" }),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"], { message: "Frekuensi wajib dipilih" }),
  interval: z.coerce.number().int().min(1, "Interval minimal 1").max(60, "Interval maksimal 60").default(1),
  // String YYYY-MM-DD kalender-valid; aksi konversi via wibDateToUtcMidnight.
  startDate: dateOnly,
  endDate: dateOnly.optional().or(z.literal("").transform(() => undefined)),
  description: z
    .string()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  amount: z.preprocess(
    (v) => (v === "" || v == null ? 0 : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().min(0, "Nominal minimal 0").default(0),
  ),
  /** Jurnal: akun debit & kredit. */
  debitAccountId: optionalId,
  creditAccountId: optionalId,
  /** Beban: akun beban, sumber dana, kategori. */
  accountId: optionalId,
  paidFromAccountId: optionalId,
  categoryId: optionalId,
  isActive: z
    .union([z.boolean(), z.literal("true"), z.literal("false"), z.literal("on")])
    .optional()
    .transform((v) => v === true || v === "true" || v === "on"),
})

export type RecurringTransactionInput = z.infer<typeof recurringTransactionSchema>
