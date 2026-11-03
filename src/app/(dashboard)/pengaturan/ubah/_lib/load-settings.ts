import { prisma } from "@/lib/db/prisma"

export async function loadSettingsForEdit() {
  const settings = await prisma.systemSetting.findFirst()
  // Putaran 94: picker hanya menawarkan akun yang bisa diposting — aktif,
  // belum soft-deleted, dan leaf (tanpa anak). Akun induk dihapus dari daftar
  // agar mapping pengaturan tidak menunjuk induk yang ditolak posting jurnal.
  const rawAccounts = await prisma.account.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: "asc" },
    select: {
      id: true, code: true, name: true, type: true,
      _count: { select: { children: true } },
    },
  })
  const accounts = rawAccounts
    .filter((account) => account._count.children === 0)
    .map(({ id, code, name, type }) => ({ id, code, name, type }))

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
    companyPkpEffectiveFrom: settings.companyPkpEffectiveFrom ? settings.companyPkpEffectiveFrom.toISOString().split("T")[0] : null,
    assetFiscalRevaluationFinalTaxRatePercent: settings.assetFiscalRevaluationFinalTaxRatePercent
      ? Number(settings.assetFiscalRevaluationFinalTaxRatePercent)
      : null,
  }

  return { settings: serializedSettings, accounts }
}
