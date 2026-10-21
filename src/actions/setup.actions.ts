"use server"

import { revalidatePath } from "next/cache"
import { signIn } from "@/lib/auth/auth"
import { assertCSRF } from "@/lib/security/csrf"
import { parseFormData } from "@/lib/validations/parse-form"
import { setupSchema } from "@/lib/validations/setup.schemas"
import { installBaseData } from "@/lib/setup/install"
import { isInstalled } from "@/lib/setup/install-state"
import { getSetupChecks, provisionSchema, type SetupChecks } from "@/lib/setup/provision"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * First-run bootstrap action.
 *
 * This is the ONE server action that must not call `requirePermission()` —
 * it runs before any user exists. It is instead guarded by `isInstalled()`
 * (refuses once an administrator exists) and `assertCSRF()`.
 */
/**
 * Status untuk langkah "Pemeriksaan Sistem" pada wizard: apakah aplikasi
 * sudah terpasang, dan bila belum, apakah database terjangkau + skemanya
 * siap. Read-only dan hanya memaparkan boolean/jumlah tabel, jadi aman
 * dipanggil sebelum ada pengguna. Sesudah terpasang, `checks` null dan
 * halaman /setup sendiri sudah me-redirect pergi.
 */
export async function getSetupStatus(): Promise<{
  installed: boolean
  checks: SetupChecks | null
}> {
  const installed = await isInstalled()
  return { installed, checks: installed ? null : await getSetupChecks() }
}

/**
 * Buat skema database dari wizard (menjalankan migrasi yang tertunda)
 * bila database terjangkau tetapi tabelnya belum ada. Gerbangnya sama
 * seperti `runSetup`: hanya sebelum instalasi + CSRF. Idempoten —
 * skema yang sudah siap dikembalikan apa adanya tanpa migrasi ulang.
 */
export async function provisionSetupSchema() {
  try {
    if (await isInstalled()) {
      return { success: false, error: "Aplikasi sudah terpasang." }
    }

    await assertCSRF()

    const before = await getSetupChecks()
    if (!before.databaseConnected) {
      return {
        success: false,
        error: "Database tidak terjangkau. Periksa DATABASE_URL pada konfigurasi server.",
        checks: before,
      }
    }
    if (before.schemaReady) {
      return { success: true, checks: before }
    }

    const result = await provisionSchema()
    const checks = await getSetupChecks()
    if (!result.success || !checks.schemaReady) {
      return {
        success: false,
        error: result.message || "Skema database belum siap.",
        checks,
      }
    }
    return { success: true, checks }
  } catch (e: unknown) {
    console.error("[provisionSetupSchema]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal menyiapkan skema database") }
  }
}

export async function runSetup(formData: FormData) {
  try {
    if (await isInstalled()) {
      return { success: false, error: "Aplikasi sudah terpasang." }
    }

    await assertCSRF()

    const parsed = parseFormData(setupSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const data = parsed.data

    const result = await installBaseData({
      companyName: data.companyName,
      companyAddress: data.companyAddress,
      companyPhone: data.companyPhone,
      companyEmail: data.companyEmail,
      companyWebsite: data.companyWebsite,
      companyTaxId: data.companyTaxId,
      companyProvince: data.companyProvince,
      companyCity: data.companyCity,
      companyDistrict: data.companyDistrict,
      companyVillage: data.companyVillage,
      companyPostalCode: data.companyPostalCode,
      adminName: data.adminName,
      adminEmail: data.adminEmail,
      adminPassword: data.adminPassword,
    })

    revalidatePath("/", "layout")

    // Sign the fresh administrator in and continue straight into the settings
    // checklist. Fall back to the login page if the session cannot be created.
    try {
      await signIn("credentials", {
        email: result.adminEmail,
        password: data.adminPassword,
        redirect: false,
      })
      return { success: true, email: result.adminEmail, redirectTo: "/pengaturan/penyelesaian" }
    } catch {
      return { success: true, email: result.adminEmail, redirectTo: "/login?setup=done" }
    }
  } catch (e: unknown) {
    console.error("[runSetup]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Instalasi gagal") }
  }
}
