import { z } from "zod"

export const createRoleSchema = z.object({
  name: z.string().min(1, "Nama role wajib diisi").max(100),
})

export const updateRoleSchema = z.object({
  name: z.string().min(1, "Nama role wajib diisi").max(100),
})
