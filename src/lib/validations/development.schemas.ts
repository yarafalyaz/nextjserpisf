import { z } from "zod"
import "./zod-locale";

export const performanceCycleSchema = z.object({
  name: z.string().min(1, "Nama siklus wajib diisi").max(191),
  periodStart: z.string().min(1, "Tanggal mulai wajib diisi"),
  periodEnd: z.string().min(1, "Tanggal akhir wajib diisi"),
})

export const performanceGoalSchema = z.object({
  cycleId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  title: z.string().min(1, "Judul sasaran wajib diisi").max(191),
  target: z.string().max(10000).optional(),
  weight: z.coerce.number().int().min(1).max(100).default(1),
  achievement: z.string().max(10000).optional(),
  score: z.coerce.number().min(0).max(100).optional(),
})

export const competencySchema = z.object({
  name: z.string().min(1, "Nama kompetensi wajib diisi").max(191),
  category: z.string().max(191).optional(),
  description: z.string().max(10000).optional(),
})

export const positionCompetencySchema = z.object({
  positionId: z.coerce.number().int().positive(),
  competencyId: z.coerce.number().int().positive(),
  requiredLevel: z.coerce.number().int().min(1).max(5),
})

export const employeeCompetencySchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  competencyId: z.coerce.number().int().positive(),
  level: z.coerce.number().int().min(1).max(5),
  notes: z.string().max(10000).optional(),
})

export const trainingSchema = z.object({
  title: z.string().min(1, "Judul pelatihan wajib diisi").max(191),
  provider: z.string().max(191).optional(),
  startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
  endDate: z.string().optional(),
  location: z.string().max(191).optional(),
  cost: z.coerce.number().min(0).default(0),
  description: z.string().max(10000).optional(),
})

export const trainingParticipantSchema = z.object({
  trainingId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
})

export const successionCandidateSchema = z.object({
  positionId: z.coerce.number().int().positive(),
  candidateEmployeeId: z.coerce.number().int().positive(),
  readiness: z.enum(["ready_now", "ready_1_2_years", "ready_future"]).default("ready_future"),
  rank: z.coerce.number().int().min(1).max(99).default(1),
  notes: z.string().max(10000).optional(),
})
