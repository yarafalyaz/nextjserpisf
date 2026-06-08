import { prisma } from "@/lib/db/prisma"

export async function loadSettingsForEdit() {
  const settings = await prisma.systemSetting.findFirst()
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  })

  if (!settings) return { settings: null, accounts }

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

  return { settings: serializedSettings, accounts }
}
