import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

const requiredDate = z.string().min(1, "Tanggal wajib diisi").transform((v) => new Date(v))
const optionalDate = z.string().optional().transform((v) => (v ? new Date(v) : undefined))

// ==================== BANK STATEMENT ====================

export const bankStatementSchema = z.object({
  accountId: z.coerce.number({ message: "accountId wajib diisi" }).int().positive(),
  bankId: optionalNumber(),
  accountNumber: optionalString(100),
  date: requiredDate,
  reference: optionalString(200),
  periodStart: optionalDate,
  periodEnd: optionalDate,
  openingBalance: z.coerce.number().default(0),
  closingBalance: z.coerce.number().default(0),
  notes: optionalString(1000),
})

// ==================== JOURNAL ====================

export const journalSchema = z.object({
  transactionDate: requiredDate,
  description: optionalString(1000),
  type: z.string().default("GENERAL"),
  entries: z.string().min(1, "Entries wajib diisi"),
  attachmentIds: optionalString(5000),
})

// ==================== EXPENSE ====================

export const expenseSchema = z.object({
  employeeId: optionalNumber(),
  accountId: z.coerce.number({ message: "accountId wajib diisi" }).int().positive(),
  paidFromAccountId: optionalNumber(),
  projectId: optionalNumber(),
  costCenterId: optionalNumber(),
  amount: z.coerce.number({ message: "amount wajib diisi" }).positive("amount harus lebih dari 0"),
  date: requiredDate,
  referenceNo: optionalString(100),
  description: optionalString(1000),
  category: optionalString(100),
  receiptImage: optionalString(500),
  attachmentIds: optionalString(5000),
})

// ==================== PETTY CASH ====================

export const pettyCashSchema = z.object({
  type: z.enum(["IN", "OUT"], { message: "type wajib diisi (IN/OUT)" }),
  amount: z.coerce.number({ message: "amount wajib diisi" }).positive("amount harus lebih dari 0"),
  date: requiredDate,
  accountId: optionalNumber(),
  description: optionalString(1000),
  attachmentIds: optionalString(5000),
})

// ==================== BANK RECONCILIATION ====================

export const bankReconciliationSchema = z.object({
  accountId: z.coerce.number({ message: "accountId wajib diisi" }).int().positive(),
  statementDate: requiredDate,
  statementBalance: z.coerce.number({ message: "statementBalance wajib diisi" }),
  periodStart: optionalDate,
  periodEnd: optionalDate,
  bookBalance: z.coerce.number().default(0),
  notes: optionalString(1000),
})

// ==================== BUDGET ====================

export const budgetSchema = z
  .object({
    name: z.string().min(1, "Nama wajib diisi").max(200),
    accountId: z.coerce.number({ message: "accountId wajib diisi" }).int().positive(),
    costCenterId: optionalNumber(),
    amount: z.coerce.number({ message: "amount wajib diisi" }).positive("amount harus lebih dari 0"),
    startDate: requiredDate,
    endDate: requiredDate,
  })
  .refine((v) => v.endDate.getTime() >= v.startDate.getTime(), {
    message: "endDate harus sama atau setelah startDate",
    path: ["endDate"],
  })

// ==================== COST CENTER ====================

export const costCenterSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi").max(50),
  name: z.string().min(1, "Nama wajib diisi").max(200),
  description: optionalString(500),
  isActive: z.boolean().default(false),
})

// ==================== UPDATE JOURNAL ====================

export const updateJournalSchema = z.object({
  transactionDate: requiredDate,
  description: optionalString(1000),
  type: z.string().default("GENERAL"),
  attachmentIds: optionalString(5000),
})

// ==================== TYPE EXPORTS ====================

export type BankStatementInput = z.infer<typeof bankStatementSchema>
export type JournalInput = z.infer<typeof journalSchema>
export type ExpenseInput = z.infer<typeof expenseSchema>
export type PettyCashInput = z.infer<typeof pettyCashSchema>
export type BankReconciliationInput = z.infer<typeof bankReconciliationSchema>
export type BudgetInput = z.infer<typeof budgetSchema>
export type CostCenterInput = z.infer<typeof costCenterSchema>
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>
