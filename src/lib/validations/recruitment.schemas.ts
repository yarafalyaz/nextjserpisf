import { z } from "zod"
import "./zod-locale";

export const vacancySchema = z.object({
  title: z.string().min(1, "Judul lowongan wajib diisi").max(191),
  departmentId: z.coerce.number().int().positive().optional(),
  positionId: z.coerce.number().int().positive().optional(),
  description: z.string().max(10000).optional(),
  requirements: z.string().max(10000).optional(),
  location: z.string().max(191).optional(),
  employmentType: z.string().max(191).optional(),
  quota: z.coerce.number().int().min(1).max(999).default(1),
})

export const applicantSchema = z.object({
  vacancyId: z.coerce.number().int().positive("Lowongan wajib dipilih"),
  name: z.string().min(1, "Nama pelamar wajib diisi").max(191),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  phone: z.string().max(191).optional(),
  source: z.string().max(191).optional(),
  cvReference: z.string().max(191).optional(),
  notes: z.string().max(10000).optional(),
})

export type VacancyInput = z.infer<typeof vacancySchema>
export type ApplicantInput = z.infer<typeof applicantSchema>
