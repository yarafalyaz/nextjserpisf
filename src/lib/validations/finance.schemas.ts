import { z } from "zod";
import { parseMoneyAmount } from "@/lib/utils/parse-money";

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const optionalNumber = (min?: number) => {
  const base =
    min !== undefined ? z.coerce.number().min(min) : z.coerce.number();
  return base.optional();
};

const requiredDate = z.coerce.date({
  message: "Tanggal wajib diisi / tidak valid",
});
const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.date().optional(),
);

// ==================== BANK STATEMENT ====================

export const bankStatementSchema = z.object({
  accountId: z.coerce
    .number({ message: "accountId wajib diisi" })
    .int()
    .positive(),
  bankId: optionalNumber(),
  accountNumber: optionalString(100),
  date: requiredDate,
  reference: optionalString(200),
  periodStart: optionalDate,
  periodEnd: optionalDate,
  openingBalance: z.coerce.number().default(0),
  closingBalance: z.coerce.number().default(0),
  notes: optionalString(1000),
});

/**
 * `YYYY-MM-DD` yang benar-benar ada di kalender.
 *
 * Sengaja tetap berupa STRING (bukan `z.coerce.date()` seperti `date` di
 * `bankStatementSchema`): aksinya harus mengonversinya lewat
 * `wibDateToUtcMidnight` agar tanggal tersimpan sebagai TENGAH MALAM UTC untuk
 * hari kalender WIB — `new Date("YYYY-MM-DD")` tidak boleh dipakai karena
 * hasilnya bergantung pada zona waktu proses. Refine-nya menolak tanggal yang
 * tidak ada (mis. `2026-13-45`) karena `Date.UTC` akan menggulirkannya diam-diam
 * ke tanggal lain.
 */
const dateOnly = z
  .string({ error: "Tanggal wajib diisi" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid (format YYYY-MM-DD)")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Tanggal tidak valid");

/**
 * Satu baris rekening koran.
 *
 * Model `BankStatementLine` sebelumnya TIDAK punya jalur tulis sama sekali —
 * hanya skrip seed yang pernah mengisinya — sehingga halaman detail rekening
 * koran tak punya isi dan `BankStatement.totalDebits`/`totalCredits` selalu 0.
 * Skema ini melengkapi sisi tulisnya (`createBankStatementLine`,
 * `updateBankStatementLine`, `deleteBankStatementLine`).
 *
 * `amount` adalah BESAR MUTASI dan selalu positif; `type` yang menentukan ke
 * kolom mana ia dipetakan (`debit` atau `credit`). Jangan mengisi kedua kolom
 * sekaligus: saat rekonsiliasi itu ambigu. `amount` di-parse dengan
 * `parseMoneyAmount`, bukan `Number()` — "2.000.000" bernilai 2 bagi `Number`.
 */
export const bankStatementLineSchema = z.object({
  bankStatementId: z.coerce
    .number({ message: "bankStatementId wajib diisi" })
    .int()
    .positive(),
  date: dateOnly,
  description: optionalString(1000),
  amount: z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce
      .number({ message: "amount wajib diisi" })
      .positive("amount harus lebih dari 0"),
  ),
  type: z.enum(["debit", "credit"], {
    message: "type wajib diisi (debit/credit)",
  }),
  reference: optionalString(200),
});

// ==================== JOURNAL ====================

export const journalSchema = z.object({
  transactionDate: requiredDate,
  description: optionalString(1000),
  type: z.string().default("GENERAL"),
  entries: z.string().min(1, "Entries wajib diisi"),
  attachmentIds: optionalString(5000),
});

// ==================== EXPENSE ====================

export const expenseSchema = z.object({
  employeeId: optionalNumber(),
  accountId: z.coerce
    .number({ message: "accountId wajib diisi" })
    .int()
    .positive(),
  paidFromAccountId: optionalNumber(),
  projectId: optionalNumber(),
  costCenterId: optionalNumber(),
  amount: z.coerce
    .number({ message: "amount wajib diisi" })
    .positive("amount harus lebih dari 0"),
  date: requiredDate,
  referenceNo: optionalString(100),
  description: optionalString(1000),
  categoryId: optionalNumber(),
  vendorId: optionalNumber(),
  receiptImage: optionalString(500),
  attachmentIds: optionalString(5000),
});

// ==================== PETTY CASH ====================

export const pettyCashSchema = z.object({
  type: z.enum(["IN", "OUT"], { message: "type wajib diisi (IN/OUT)" }),
  amount: z.coerce
    .number({ message: "amount wajib diisi" })
    .positive("amount harus lebih dari 0"),
  date: requiredDate,
  accountId: optionalNumber(),
  referenceNo: optionalString(100),
  description: optionalString(1000),
  projectId: optionalNumber(),
  vendorId: optionalNumber(),
  categoryId: optionalNumber(),
  attachmentIds: optionalString(5000),
});

// ==================== BANK RECONCILIATION ====================

export const bankReconciliationSchema = z.object({
  accountId: z.coerce
    .number({ message: "accountId wajib diisi" })
    .int()
    .positive(),
  statementDate: requiredDate,
  statementBalance: z.coerce.number({
    message: "statementBalance wajib diisi",
  }),
  periodStart: optionalDate,
  periodEnd: optionalDate,
  bookBalance: z.coerce.number().default(0),
  notes: optionalString(1000),
});

// ==================== COST CENTER ====================

export const costCenterSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi").max(50),
  name: z.string().min(1, "Nama wajib diisi").max(200),
  description: optionalString(500),
  isActive: z.boolean().default(false),
  parentId: optionalNumber(),
});

/**
 * Pusat laba (profit center) — datar: hanya kode + nama.
 *
 * Model `ProfitCenter` sebelumnya TIDAK punya jalur tulis sama sekali, padahal
 * laporan pusat laba membacanya dan `JournalEntry.profitCenterId` ada di skema.
 * Akibatnya laporan selalu menumpuk di "Tanpa Pusat Laba".
 */
export const profitCenterSchema = z.object({
  code: z.string({ error: "Kode wajib diisi" }).trim().min(1, "Kode wajib diisi").max(50),
  name: z.string({ error: "Nama wajib diisi" }).trim().min(1, "Nama wajib diisi").max(200),
});

