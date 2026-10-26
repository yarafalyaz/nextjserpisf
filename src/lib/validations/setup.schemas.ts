import { z } from "zod"

import { passwordPolicyError } from "@/lib/auth/password-policy"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

/**
 * First-run setup form. Company identity + the first administrator account.
 * `confirmPassword` must match — checked with a `refine` so the error surfaces
 * on the confirmation field.
 */
export const setupSchema = z
  .object({
    companyName: z.string().min(1, "Nama perusahaan wajib diisi").max(200),
    companyAddress: optionalString(500),
    // Nomor telepon bukan teks bebas: huruf ditolak di server (form juga
    // menyaring ketikan), tanda + - ( ) dan spasi tetap sah untuk format
    // seperti +62-21-555-0100.
    companyPhone: z
      .string()
      .max(50)
      .regex(/^[0-9+\-\s()]*$/, "Nomor telepon hanya boleh berisi angka dan tanda + - ( )")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    companyEmail: z
      .string()
      .email("Email perusahaan tidak valid")
      .max(200)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    companyWebsite: optionalString(255),
    companyTaxId: optionalString(50),
    companyProvince: optionalString(100),
    companyCity: optionalString(100),
    companyDistrict: optionalString(100),
    companyVillage: optionalString(100),
    companyPostalCode: optionalString(10),
    adminName: z.string().min(1, "Nama administrator wajib diisi").max(200),
    adminEmail: z.string().email("Email tidak valid").max(200),
    adminPassword: z
      .string()
      .max(256)
      .superRefine((value, ctx) => {
        const issue = passwordPolicyError(value, "Kata sandi")
        if (issue) ctx.addIssue({ code: "custom", message: issue })
      }),
    confirmPassword: z.string().min(1, "Konfirmasi kata sandi wajib diisi"),
  })
  .refine((data) => data.adminPassword === data.confirmPassword, {
    message: "Konfirmasi kata sandi tidak cocok",
    path: ["confirmPassword"],
  })

