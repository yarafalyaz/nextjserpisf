import { z } from "zod";
import "./zod-locale";
import { parseMoneyAmount } from "@/lib/utils/parse-money";

/**
 * `YYYY-MM-DD` yang benar-benar ada di kalender.
 *
 * Sengaja tetap berupa STRING (bukan `z.coerce.date()`): aksinya harus mengonversinya lewat
 * `wibDateToUtcMidnight` agar tanggal tersimpan sebagai TENGAH MALAM UTC untuk
 * hari kalender WIB — `new Date("YYYY-MM-DD")` tidak boleh dipakai karena
 * hasilnya bergantung pada zona waktu proses. Refine-nya menolak tanggal yang
 * tidak ada (mis. `2026-13-45`) karena `Date.UTC` akan menggulirkannya diam-diam
 * ke tanggal lain.
 */
export const dateOnly = z
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

const optionalDateOnly = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
);

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

/** Nominal yang boleh nol/negatif (saldo): parse format Indonesia dulu, bukan Number() mentah. */
const moneyAmount = (message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number({ message }),
  );

/** Nominal mutasi positif: sama, wajib > 0. */
const positiveMoneyAmount = (message: string, positiveMessage: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number({ message }).positive(positiveMessage),
  );

// ==================== BANK STATEMENT ====================

export const bankStatementSchema = z.object({
  accountId: z.coerce
    .number({ message: "accountId wajib diisi" })
    .int()
    .positive(),
  bankId: optionalNumber(),
  accountNumber: optionalString(100),
  date: dateOnly,
  reference: optionalString(200),
  periodStart: optionalDateOnly,
  periodEnd: optionalDateOnly,
  openingBalance: z.preprocess(
    (v) => (v === "" || v == null ? 0 : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().default(0),
  ),
  closingBalance: z.preprocess(
    (v) => (v === "" || v == null ? 0 : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().default(0),
  ),
  notes: optionalString(1000),
});


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
  transactionDate: dateOnly,
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
  amount: positiveMoneyAmount("amount wajib diisi", "amount harus lebih dari 0"),
  date: dateOnly,
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
  amount: positiveMoneyAmount("amount wajib diisi", "amount harus lebih dari 0"),
  date: dateOnly,
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
  statementDate: dateOnly,
  statementBalance: moneyAmount("statementBalance wajib diisi"),
  periodStart: optionalDateOnly,
  periodEnd: optionalDateOnly,
  bookBalance: z.preprocess(
    (v) => (v === "" || v == null ? 0 : typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce.number().default(0),
  ),
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

// ==================== UPDATE JOURNAL ====================

export const updateJournalSchema = z.object({
  transactionDate: dateOnly,
  description: optionalString(1000),
  type: z.string().default("GENERAL"),
  attachmentIds: optionalString(5000),
});


// ==================== BANK TRANSFER ====================

/**
 * Server-side schema untuk createBankTransfer: hand-parse sebelumnya tanpa
 * max-length — description 5MB lolos ke DB. `date` wajib YYYY-MM-DD yang
 * benar-benar ada di kalender (pakai refine Date.UTC seperti `dateOnly` di
 * atas, bukan `z.coerce.date()`) dan dikonversi via wibDateToUtcMidnight.
 * adminFee 0 = tidak ada biaya (feeAccountId opsional); > 0 wajib feeAccountId.
 */
export const bankTransferSchema = z
  .object({
    date: dateOnly,
    fromAccountId: z.coerce
      .number({ message: "Rekening asal wajib dipilih" })
      .int()
      .positive(),
    toAccountId: z.coerce
      .number({ message: "Rekening tujuan wajib dipilih" })
      .int()
      .positive(),
    amount: z.preprocess(
      (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
      z.coerce
        .number({ message: "Nominal transfer wajib diisi" })
        .positive("Nominal transfer harus lebih dari 0"),
    ),
    adminFee: z.preprocess(
      (v) =>
        v === "" || v == null
          ? 0
          : typeof v === "string"
            ? (parseMoneyAmount(v) ?? 0)
            : v,
      z.coerce.number().min(0, "Biaya admin tidak boleh negatif"),
    ),
    feeAccountId: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.coerce.number().int().positive().optional(),
    ),
    description: optionalString(2000),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Rekening asal dan tujuan tidak boleh sama",
    path: ["toAccountId"],
  })
  .refine((v) => v.adminFee <= 0 || v.feeAccountId !== undefined, {
    message:
      "Akun beban biaya admin wajib dipilih bila biaya admin lebih dari 0",
    path: ["feeAccountId"],
  });

// ==================== TAX PAYMENT ====================

/**
 * Masa pajak `YYYY-MM` yang benar-benar ada di kalender.
 *
 * Regex saja tidak cukup: `/^\d{4}-\d{2}$/` meloloskan "2026-13"/"2026-00"
 * yang lalu tersimpan sebagai masa pajak fiktif dan tercetak mentah di
 * laporan penyetoran pajak.
 */
const taxPeriod = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Masa pajak harus dalam format YYYY-MM, mis. 2026-09")
  .refine((v) => {
    const month = Number(v.slice(5, 7));
    return month >= 1 && month <= 12;
  }, "Masa pajak harus dalam format YYYY-MM, mis. 2026-09");

/**
 * Server-side schema untuk createTaxPayment: hand-parse sebelumnya tanpa
 * max-length — reference/notes 5MB lolos ke DB. taxTypeId opsional
 * (tanpa jenis = setor umum); period opsional (tanpa masa = setor umum).
 */
export const taxPaymentSchema = z.object({
  date: dateOnly,
  period: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    taxPeriod.optional(),
  ),
  /** Kode billing MPN: tepat 15 digit bila diisi (F-005). */
  billingCode: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^\d{15}$/, "Kode billing harus 15 digit").optional(),
  ),
  /** NTPN: tepat 16 karakter bila diisi (F-005). */
  ntpn: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().length(16, "NTPN harus 16 karakter").optional(),
  ),
  /** Jenis pajak terstruktur (F-005): ppn|pph21|pph23|pph4_2|pph_badan|other. */
  taxKind: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["ppn", "pph21", "pph23", "pph4_2", "pph_badan", "other"]).optional(),
  ),
  taxTypeId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  taxAccountId: z.coerce
    .number({ message: "Akun utang pajak wajib dipilih" })
    .int()
    .positive(),
  paymentAccountId: z.coerce
    .number({ message: "Akun kas/bank wajib dipilih" })
    .int()
    .positive(),
  amount: z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce
      .number({ message: "Jumlah setor wajib diisi" })
      .positive("Jumlah setor harus lebih dari 0"),
  ),
  reference: optionalString(200),
  notes: optionalString(2000),
});

// ==================== EXPENSE CATEGORY ====================

/**
 * Server-side schema untuk createExpenseCategory/updateExpenseCategory:
 * hand-parse sebelumnya tanpa max-length (name/label 5MB lolos ke DB) dan
 * `Number(...) || 0` yang diam-diam mengubah garbage ("abc", NaN) jadi 0.
 */
export const expenseCategorySchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(100),
  label: z.string().min(1, "Label wajib diisi").max(200),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().optional().default(false),
});

// ==================== CHEQUE / GIRO ====================

/**
 * Server-side schema untuk createCheque: hand-parse sebelumnya tanpa
 * max-length — number/party/notes 5MB lolos ke DB, type/direction arbitrary
 * string diam-diam jadi "giro"/"in", amount 0/negatif hanya dicek manual.
 */
export const chequeSchema = z.object({
  type: z.enum(["giro", "cek"], {
    message: "type wajib diisi (giro/cek)",
  }),
  direction: z.enum(["in", "out"], {
    message: "direction wajib diisi (in/out)",
  }),
  number: optionalString(100),
  party: optionalString(200),
  accountId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  amount: z.preprocess(
    (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
    z.coerce
      .number({ message: "amount wajib diisi" })
      .positive("Nominal giro/cek harus lebih dari 0"),
  ),
  dueDate: dateOnly,
  notes: optionalString(2000),
});

// ==================== PURCHASE ADVANCE ====================

/**
 * Server-side schema untuk createPurchaseAdvance: hand-parse sebelumnya tanpa
 * max-length — description 5MB lolos ke DB, tanggal via `new Date()` yang
 * bergantung zona waktu proses. `date` wajib YYYY-MM-DD yang benar-benar ada
 * di kalender, dikonversi via wibDateToUtcMidnight di action.
 */
export const purchaseAdvanceSchema = z
  .object({
    date: dateOnly,
    vendorId: z.coerce
      .number({ message: "Pemasok wajib dipilih" })
      .int()
      .positive("Pemasok wajib dipilih"),
    amount: z.preprocess(
      (v) => (typeof v === "string" ? parseMoneyAmount(v) : v),
      z.coerce
        .number({ message: "Jumlah uang muka harus lebih dari 0" })
        .positive("Jumlah uang muka harus lebih dari 0"),
    ),
    paymentAccountId: z.coerce
      .number({ message: "Akun kas/bank wajib dipilih" })
      .int()
      .positive(),
    advanceAccountId: z.coerce
      .number({ message: "Akun uang muka wajib dipilih" })
      .int()
      .positive(),
    description: optionalString(2000),
  })
  .refine((v) => v.paymentAccountId !== v.advanceAccountId, {
    message: "Akun kas/bank dan akun uang muka tidak boleh sama",
    path: ["advanceAccountId"],
  });
