"use server"

import { revalidatePath } from "next/cache"
import { signIn } from "@/lib/auth/auth"
import { assertCSRF } from "@/lib/security/csrf"
import { parseFormData } from "@/lib/validations/parse-form"
import { setupSchema } from "@/lib/validations/setup.schemas"
import { installBaseData } from "@/lib/setup/install"
import { isInstalled } from "@/lib/setup/install-state"
import { getErrorMessage } from "@/lib/utils/error"

/**
 * First-run bootstrap action.
 *
 * This is the ONE server action that must not call `requirePermission()` —
 * it runs before any user exists. It is instead guarded by `isInstalled()`
 * (refuses once an administrator exists) and `assertCSRF()`.
 */
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
