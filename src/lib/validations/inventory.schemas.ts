import { z } from "zod"
import "./zod-locale";
import { dateOnly } from "@/lib/validations/finance.schemas"

// ==================== Helpers ====================

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

// Tetap string `dateOnly` (kalender-valid); action konversi via
// `wibDateToUtcMidnight`. `new Date("2026-02-30")` menggulir ke 2 Mar.
const dateString = dateOnly

const optionalStr = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.coerce.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.coerce.number().int().positive().optional()

// Kosong/tak-terisi -> undefined; non-kosong wajib `dateOnly` kalender-valid.
const optionalDateOnly = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
)

// ==================== STOCK ADJUSTMENT ====================

export const stockAdjustmentSchema = z.object({
  warehouseId: z.coerce.number().min(1, "Gudang wajib dipilih"),
  date: dateString,
  reason: optionalString(500),
  type: optionalString(50),
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

// ==================== INVENTORY TRANSFER ====================

export const inventoryTransferSchema = z.object({
  sourceWarehouseId: z.coerce.number().min(1, "Gudang asal wajib dipilih"),
  destinationWarehouseId: z.coerce.number().min(1, "Gudang tujuan wajib dipilih"),
  date: dateString,
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
}).refine((data) => data.sourceWarehouseId !== data.destinationWarehouseId, {
  message: "Gudang asal dan tujuan tidak boleh sama",
  path: ["destinationWarehouseId"],
})


// ==================== MATERIAL REQUEST (F-2026-10-22-078-S) ====================

export const materialRequestSchema = z.object({
  requesterWarehouseId: z.coerce.number().min(1, "Gudang tujuan wajib dipilih"),
  sourceWarehouseId: z.coerce.number().min(1, "Gudang sumber wajib dipilih"),
  workOrderId: optionalNumber(),
  neededBy: optionalDateOnly,
  items: optionalString(50000), // JSON string, parsed separately
}).refine((data) => data.requesterWarehouseId !== data.sourceWarehouseId, {
  message: "Gudang sumber dan gudang tujuan tidak boleh sama",
  path: ["sourceWarehouseId"],
})

// ==================== MATERIAL ISSUE ====================

export const materialIssueSchema = z.object({
  warehouseId: z.coerce.number().min(1, "Gudang wajib dipilih"),
  projectId: optionalNumber(),
  workOrderId: optionalNumber(),
  costCenterId: optionalNumber(),
  date: dateString,
  notes: optionalString(1000),
  items: optionalString(50000), // JSON string, parsed separately
})

// ==================== WORK ORDER ====================

// F-2026-10-21-035 (vonis Lead Q-LEAD-2, t_586ab283): daftar tertutup alasan
// geser endDate WO. Kode = kontrak data (disimpan di metadata ActivityLog);
// label = teks tampil. Di file skema (bukan actions) supaya bisa dipakai UI
// dan tidak melanggar aturan ekspor file "use server".
export const WORK_ORDER_END_DATE_REASONS = {
  part_delay: "Menunggu suku cadang",
  scope_change: "Perubahan ruang lingkup pekerjaan",
  queue_capacity: "Antrean/kapasitas bengkel",
  customer_request: "Permintaan pelanggan",
  customer_unavailable: "Kendaraan/pelanggan belum tersedia",
  technical_issue: "Kendala teknis pengerjaan",
  other: "Lainnya",
} as const
export type WorkOrderEndDateReasonCode = keyof typeof WORK_ORDER_END_DATE_REASONS

export const workOrderSchema = z.object({
  customerId: requiredId("Pelanggan"),
  projectId: optionalId,
  quotationId: optionalId,
  date: dateString,
  startDate: optionalDateOnly,
  endDate: optionalDateOnly,
  // F-2026-10-21-035 (vonis Lead Q-LEAD-2): alasan geser endDate. Wajib hanya
  // bila endDate lama non-null dan berubah — penegakan di aksi (butuh nilai
  // tersimpan), di sini hanya bentuknya. Kode tertutup di
  // WORK_ORDER_END_DATE_REASON_CODES (inventory.actions).
  endDateReasonCode: optionalStr(50),
  endDateReasonNote: optionalStr(500),
  notes: optionalStr(2000),
  items: optionalStr(50000), // JSON string, parsed separately
})

// Revisi item WO berjalan (F-2026-10-20-06): tambah item baru + tandai item
// lama diganti. Item diganti WAJIB belum ter-issue (guard di aksi dari
// MaterialIssue completed); retur stok item ter-issue tetap lewat jalur
// Material Issue/retur existing, bukan aksi ini.
export const reviseWorkOrderItemsSchema = z.object({
  workOrderId: requiredId("Perintah Kerja"),
  replacedItemIds: z
    .array(z.coerce.number().int().positive())
    .max(200)
    .default([]),
  newItems: z
    .array(
      z.object({
        itemId: z.coerce.number().int().positive(),
        qty: z.coerce.number().positive(),
        cost: z.coerce.number().min(0).default(0),
        description: optionalStr(500),
      }),
    )
    .max(200)
    .default([]),
  // F-2026-10-21-035 Q-LEAD-3: geser endDate opsional di jalur sempit ini.
  // `undefined` = tidak digeser; string tanggal = target baru. Alasan wajib
  // bila nilai lama non-null dan berubah (penegakan di aksi).
  newEndDate: optionalDateOnly,
  endDateReasonCode: optionalStr(50),
  endDateReasonNote: optionalStr(500),
})

// ==================== RACK ====================

export const rackSchema = z.object({
  code: optionalStr(50),
  name: requiredStr("Nama rak wajib diisi", 100),
  warehouseId: requiredId("Gudang"),
})

// ==================== RACK ROW ====================

export const rackRowSchema = z.object({
  rackId: requiredId("Rak"),
  code: optionalStr(50),
  name: requiredStr("Nama baris rak wajib diisi", 100),
})

