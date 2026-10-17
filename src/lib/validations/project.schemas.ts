import { z } from "zod"

// ==================== Helpers ====================

const optionalStr = (max = 500) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.coerce.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.coerce.number().int().positive().optional()

const optionalDate = z.string().optional()

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
