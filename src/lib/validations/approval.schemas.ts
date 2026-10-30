import { z } from "zod"
import "./zod-locale";
import { APPROVAL_MODEL_TYPES } from "@/lib/constants/approval"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

// ==================== APPROVE / REJECT STEP ====================

export const approveStepSchema = z.object({
  notes: optionalString(2000),
})

export const rejectStepSchema = z.object({
  notes: optionalString(2000),
})

// ==================== WORKFLOW CRUD ====================

export const createWorkflowSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(255),
  // R6WN-06: enum, bukan string bebas — typo ("journal") dulu lahir workflow
  // aktif yang tidak pernah cocok dengan tipe dokumen backend.
  modelType: z.enum(APPROVAL_MODEL_TYPES),
  code: optionalString(100),
  isActive: z.boolean().optional().default(true),
  steps: optionalString(10000), // JSON string, parsed separately
})

export const updateWorkflowSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(255),
  modelType: z.enum(APPROVAL_MODEL_TYPES),
  code: optionalString(100),
  isActive: z.boolean().optional().default(true),
  steps: optionalString(10000), // JSON string, parsed separately
})

// Inner step objects. Without this, a manage_settings holder could push
// arbitrary roleId values, oversized names, or non-string approverType strings
// into workflow steps (same bypass class as the manufacturing-BOM and master-
// data fixes). Server-side validation enforces:
//   - roleId / userId: positive integer (1..2_147_483_647) or null
//   - name: optional, 1..255 chars
//   - approverType: optional, 1..100 chars
// R6WN-07: setiap langkah WAJIB menunjuk approver (roleId atau userId).
// Langkah name-only/approverType-only lolos filter hitungan lama tetapi
// assertStepApprover selesai tanpa cek — siapa pun ber-permission bisa
// menyetujui. approverType hanya metadata tampilan, bukan penunjuk approver.
const optionalStepId = z
  .union([z.coerce.number().int().positive(), z.null()])
  .optional()

export const workflowStepSchema = z
  .object({
    name: z.string().max(255).optional(),
    roleId: optionalStepId,
    userId: optionalStepId,
    approverType: z.string().max(100).optional(),
  })
  .refine((s) => s.roleId != null || s.userId != null, {
    message: "Setiap langkah wajib memilih peran atau pengguna approver",
  })

export const workflowStepsSchema = z
  .array(workflowStepSchema)
  .min(1, "Minimal harus ada satu langkah persetujuan")
  .max(50, "Maksimal 50 langkah persetujuan")
