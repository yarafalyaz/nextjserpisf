"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { logActivity } from "@/lib/services/activity-log.service"

/**
 * Toggle a (role × module × action) access row.
 * FormData fields:
 *   - roleId
 *   - moduleActionId
 *   - allowed: "1" | "0"
 *   - returnTo: optional path to redirect back to
 */
export async function toggleModuleAccess(formData: FormData) {
  try {
    const actor = await requirePermission("manage_settings")

    const roleId = Number(formData.get("roleId"))
    const moduleActionId = Number(formData.get("moduleActionId"))
    const allowed = formData.get("allowed") === "1"

    if (!Number.isSafeInteger(roleId) || roleId <= 0 || !Number.isSafeInteger(moduleActionId) || moduleActionId <= 0) {
      throw new Error("Parameter tidak valid")
    }

    // Fetch the role's name to protect super_admin
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    })
    if (role?.name === "super_admin" && !actor.roles.includes("super_admin")) {
      throw new Error("Hanya super_admin yang dapat mengubah peran super_admin")
    }

    // Fetch the action to get its moduleId
    const action = await prisma.moduleAction.findUnique({
      where: { id: moduleActionId },
      select: { moduleId: true },
    })
    if (!action) throw new Error("Aksi tidak ditemukan")

    // Upsert the access row
    await prisma.roleModuleAccess.upsert({
      where: {
        roleId_moduleId_moduleActionId: {
          roleId,
          moduleId: action.moduleId,
          moduleActionId,
        },
      },
      create: { roleId, moduleId: action.moduleId, moduleActionId, allowed },
      update: { allowed },
    })

    revalidatePath(`/pengaturan/peran/${roleId}`)
    revalidatePath(`/pengaturan/peran/${roleId}/modul`)
    revalidatePath("/pengaturan/peran")

    await logActivity(
      allowed ? "grant" : "revoke",
      "RoleModuleAccess",
      roleId,
      `${allowed ? "Mengizinkan" : "Menolak"} aksi ${moduleActionId} pada peran ${role?.name ?? roleId}`,
    )

    const returnTo = formData.get("returnTo") as string | null
    // `redirect()` accepts absolute URLs. Only honor a same-origin relative
    // path so a crafted form can't turn this privileged action into an
    // open-redirect endpoint.
    if (returnTo?.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\")) {
      const { redirect } = await import("next/navigation")
      redirect(returnTo)
    }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[toggleModuleAccess]", getErrorMessage(e) || e)
    throw e
  }
}
