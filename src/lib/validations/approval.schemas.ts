import { z } from "zod"

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
  modelType: z.string().min(1, "Tipe dokumen wajib diisi").max(255),
  code: optionalString(100),
  isActive: z.boolean().optional().default(true),
  steps: optionalString(10000), // JSON string, parsed separately
})

export const updateWorkflowSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(255),
  modelType: z.string().min(1, "Tipe dokumen wajib diisi").max(255),
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
// Each step must satisfy at least one of roleId / userId / approverType / name —
// otherwise the entire filter drops it, but we still want a real validation
// signal when EVERY step is empty (a workflow with zero effective approvers
// would bypass any approval flow silently).
const optionalStepId = z
  .union([z.coerce.number().int().positive(), z.null()])
  .optional()

export const workflowStepSchema = z.object({
  name: z.string().max(255).optional(),
  roleId: optionalStepId,
  userId: optionalStepId,
  approverType: z.string().max(100).optional(),
})

export const workflowStepsSchema = z
  .array(workflowStepSchema)
  .max(50, "Maksimal 50 langkah persetujuan")
