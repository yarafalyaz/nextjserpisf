import { z } from "zod"

/**
 * Runtime environment validation.
 * Crashes early at import time if required vars are missing.
 */

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
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
export type ClientEnv = z.infer<typeof clientSchema>

function validateEnv() {
  // Skip validation during build or test/CI (env vars not fully available)
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NODE_ENV === "test" ||
    process.env.CI === "true"
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
export const clientEnv = validateClientEnv()
