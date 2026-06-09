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
