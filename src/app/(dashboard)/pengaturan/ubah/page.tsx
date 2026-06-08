export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SettingsEditForm } from "./_components/settings-edit-form"

export default async function SettingsEditPage() {
  await requirePermission("manage_settings")

  const settings = await prisma.systemSetting.findFirst()
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  })

  if (!settings) {
    return <div className="p-6 text-danger">Pengaturan sistem tidak ditemukan.</div>
  }

  // Serialize Decimal fields to number/string for client component
  const serializedSettings = {
    ...settings,
    companyLatitude: settings.companyLatitude ? Number(settings.companyLatitude) : null,
    companyLongitude: settings.companyLongitude ? Number(settings.companyLongitude) : null,
    overtimeMultiplier: Number(settings.overtimeMultiplier),
    overtimeCoefficient: Number(settings.overtimeCoefficient),
    attendanceRadiusKm: Number(settings.attendanceRadiusKm),
    latePenaltyPerMinute: Number(settings.latePenaltyPerMinute),
    periodLockDate: settings.periodLockDate ? settings.periodLockDate.toISOString().split("T")[0] : null,
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Pengaturan Sistem</h1>
      </div>
      <SettingsEditForm settings={serializedSettings} accounts={accounts} />
    </div>
  )
}
