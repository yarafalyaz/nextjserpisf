import { z } from "zod"
import "./zod-locale";

const roleBase = {
  name: z.string().min(1, "Nama role wajib diisi").max(100),
}

export const createRoleSchema = z.object({ ...roleBase })
export const updateRoleSchema = z.object({ ...roleBase })

// Daftar izin dari checkbox berulang dibaca via getAll (parseFormData last-wins),
// jadi divalidasi terpisah: tiap ID wajib integer positif, daftar dibatasi.
export const rolePermissionIdsSchema = z
  .array(z.coerce.number().int().positive())
  .max(500)
