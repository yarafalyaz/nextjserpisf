import { z } from "zod"
import "@/lib/validations/zod-locale";

/**
 * Runtime environment validation.
 * Crashes early at import time if required vars are missing.
 */

/**
 * Nilai contoh yang beredar di `.env.example` dan `docker-compose.yml`. Kalau
 * salah satunya terpakai, tanda tangan sesi bisa dihitung siapa pun.
 */
const PLACEHOLDER_AUTH_SECRETS = new Set([
  "your-secret-key-change-in-production",
  "generate-with-openssl-rand-base64-32",
])

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Sesi Auth.js adalah JWE yang ditandatangani AUTH_SECRET. Secret yang pendek
  // atau masih berupa nilai contoh berarti siapa pun dapat mencetak token
  // `super_admin` tanpa kredensial — jadi keduanya ditolak di sini.
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET minimal 32 karakter — buat dengan `openssl rand -base64 32`")
    .refine((value) => !PLACEHOLDER_AUTH_SECRETS.has(value.trim()), {
      message: "AUTH_SECRET masih memakai nilai contoh — buat dengan `openssl rand -base64 32`",
    }),
  NEXTAUTH_URL: z.string().url().optional(),
  CRON_SECRET: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  ACCUMULATED_DEPRECIATION_ACCOUNT_ID: z.coerce.number().optional(),
  DEPRECIATION_EXPENSE_ACCOUNT_ID: z.coerce.number().optional(),
  FIXED_ASSET_ACCOUNT_ID: z.coerce.number().optional(),
  ASSET_CASH_ACCOUNT_ID: z.coerce.number().optional(),
  ASSET_DISPOSAL_GAINLOSS_ACCOUNT_ID: z.coerce.number().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
})

const clientSchema = z.object({
  NEXT_PUBLIC_ASSET_BASE_URL: z.string().optional(),
})

export type ServerEnv = z.infer<typeof serverSchema>

function validateEnv() {
  // Skip validasi hanya saat build produksi (env belum tersedia penuh) atau
  // NODE_ENV=test. CI=true SAJA tidak cukup: runner CI unit/build/E2E sudah
  // menyetel DATABASE_URL (+ secret 32+ char untuk E2E), jadi validasi tetap
  // jalan dan secret/URL basi tertangkap di sana — bukan lolos diam-diam.
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NODE_ENV === "test"
  ) {
    return process.env as unknown as ServerEnv
  }

  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:")
    console.error(parsed.error.flatten().fieldErrors)
    throw new Error("Invalid environment variables")
  }
  return parsed.data
}

function validateClientEnv() {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_ASSET_BASE_URL: process.env.NEXT_PUBLIC_ASSET_BASE_URL,
  })
  if (!parsed.success) {
    console.error("❌ Invalid public environment variables:")
    console.error(parsed.error.flatten().fieldErrors)
    throw new Error("Invalid public environment variables")
  }
  return parsed.data
}

export const env = validateEnv()

// Validate public env on module load (throws when NEXT_PUBLIC_ASSET_BASE_URL is
// malformed). The return value is intentionally not exported — the module
// side-effect is the contract, and no consumer reads the parsed object.
void validateClientEnv()
