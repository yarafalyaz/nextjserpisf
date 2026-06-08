export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/shadcn/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/shadcn/card"
import { Pencil } from "lucide-react"

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "-"}</span>
    </div>
  )
}

export default async function OvertimeAttendancePage() {
  await requirePermission("manage_settings")
  const settings = await prisma.systemSetting.findFirst()

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan", href: "/pengaturan" }, { label: "Lembur & Kehadiran" }]} />

      <Card>
        <CardHeader>
          <CardTitle>Lembur & Kehadiran</CardTitle>
          <CardDescription>Parameter perhitungan lembur dan aturan presensi karyawan.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/pengaturan/lembur-kehadiran/ubah"><Pencil className="size-3.5" /> Ubah</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Pengali Lembur" value={settings?.overtimeMultiplier ? Number(settings.overtimeMultiplier).toString() : null} />
            <Field label="Koefisien Lembur" value={settings?.overtimeCoefficient ? Number(settings.overtimeCoefficient).toString() : null} />
            <Field label="Istirahat Lembur Mulai" value={settings?.overtimeMealBreakStart} />
            <Field label="Istirahat Lembur Selesai" value={settings?.overtimeMealBreakEnd} />
            <Field label="ISOMA Mulai" value={settings?.restBreakStart} />
            <Field label="ISOMA Selesai" value={settings?.restBreakEnd} />
            <Field label="Radius Kehadiran (KM)" value={settings?.attendanceRadiusKm ? Number(settings.attendanceRadiusKm).toString() : null} />
            <Field label="Denda Terlambat/Menit" value={settings?.latePenaltyPerMinute ? `Rp ${Number(settings.latePenaltyPerMinute).toLocaleString("id-ID")}` : null} />
            <Field label="Maks Menit Denda" value={settings?.maxLatePenaltyMinutes?.toString()} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
