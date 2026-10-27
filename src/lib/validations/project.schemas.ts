import { z } from "zod"
import "./zod-locale";
import { dateOnly } from "@/lib/validations/finance.schemas";

// ==================== Helpers ====================

const optionalStr = (max = 500) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.coerce.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.coerce.number().int().positive().optional()

const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
);

// ==================== Project ====================

/**
 * Entri log aktivitas proyek.
 *
 * Sebelum ini tabel `project_logs` tidak punya jalur tulis sama sekali: tab "Log"
 * di halaman proyek merender 10 log terakhir beserta keadaan kosongnya, tetapi
 * tidak ada yang bisa menuliskannya — log selalu kosong.
 *
 * `userId` (penulis) TIDAK diambil dari form: aksinya mengisinya dari sesi.
 */
export const projectLogSchema = z.object({
  action: z
    .string({ error: "Jenis aksi wajib dipilih" })
    .trim()
    .min(1, "Jenis aksi wajib dipilih")
    .max(100),
  notes: optionalStr(2000),
})

export const createProjectSchema = z.object({
  name: requiredStr("Nama proyek wajib diisi"),
  description: optionalStr(1000),
  customerId: requiredId("Customer"),
  customerVehicleId: optionalId,
  workOrderId: optionalId,
  costCenterId: optionalId,
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalStr(2000),
})

export const updateProjectSchema = z.object({
  name: requiredStr("Nama proyek wajib diisi"),
  description: optionalStr(1000),
  customerId: requiredId("Customer"),
  customerVehicleId: optionalId,
  workOrderId: optionalId,
  costCenterId: optionalId,
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalStr(2000),
})

// ==================== Project Budget (RAB) F-2026-10-21-030 ====================

/**
 * Baris RAB proyek. `category` kanonik material|labor|subkontrak|lain
 * (PROJECT_BUDGET_CATEGORIES di builder anggaran) — divalidasi di sini
 * supaya baris tak sah tidak pernah tersimpan dari jalur form.
 */
const budgetCategory = z.enum(["material", "labor", "subkontrak", "lain"], {
  error: "Kategori RAB tidak valid",
})

const optionalBudgetCategory = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  budgetCategory.optional(),
)

export const projectBudgetItemSchema = z.object({
  itemId: optionalId,
  projectStageId: optionalId,
  category: optionalBudgetCategory,
  description: optionalStr(1000),
  qty: z.coerce
    .number({ error: "Qty wajib diisi" })
    .positive("Qty harus lebih dari 0"),
  cost: z.coerce
    .number({ error: "Biaya satuan wajib diisi" })
    .min(0, "Biaya satuan tidak boleh negatif"),
  sortOrder: z.coerce.number().int().min(0).optional(),
})

export const projectBudgetItemUpdateSchema = projectBudgetItemSchema.extend({
  id: requiredId("ID baris RAB"),
})

export const manualContractSchema = z.object({
  contractAmount: z.coerce
    .number({ error: "Nilai kontrak wajib diisi" })
    .positive("Nilai kontrak harus lebih dari 0"),
  reason: z
    .string({ error: "Alasan wajib diisi" })
    .trim()
    .min(1, "Alasan wajib diisi")
    .max(2000),
})

export const budgetRevisionProposalSchema = z.object({
  reason: z
    .string({ error: "Alasan revisi wajib diisi" })
    .trim()
    .min(1, "Alasan revisi wajib diisi")
    .max(2000),
  /** JSON terstruktur perubahan baris + kontrak usulan; diparse aksi. */
  changes: z.string().min(2, "Perubahan revisi wajib diisi").max(20000),
})

// ==================== Task ====================

export const createTaskSchema = z.object({
  projectId: requiredId("Project"),
  name: requiredStr("Nama tugas wajib diisi"),
  description: optionalStr(1000),
  status: z.string().optional().default("pending"),
  assignedTo: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
})

export const updateTaskSchema = z.object({
  id: requiredId("ID"),
  projectId: requiredId("Project"),
  name: requiredStr("Nama tugas wajib diisi"),
  description: optionalStr(1000),
  status: z.string().optional().default("pending"),
  assignedTo: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
})
