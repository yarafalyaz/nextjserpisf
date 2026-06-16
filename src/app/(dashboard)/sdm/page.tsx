import {
  Clock, Palmtree, Timer, Banknote, CalendarDays, PiggyBank
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "SDM" }

const hrmModules: ModuleItem[] = [
  { label: "Absensi", href: "/sdm/absensi", icon: Clock, desc: "Absensi karyawan" },
  { label: "Cuti", href: "/sdm/cuti", icon: Palmtree, desc: "Cuti karyawan" },
  { label: "Lembur", href: "/sdm/lembur", icon: Timer, desc: "Lembur" },
  { label: "Penggajian", href: "/sdm/penggajian", icon: Banknote, desc: "Penggajian" },
  { label: "Jadwal Kerja", href: "/sdm/jadwal-kerja", icon: CalendarDays, desc: "Jadwal kerja" },
  { label: "Lembar Waktu", href: "/sdm/lembar-waktu", icon: Clock, desc: "Lembar waktu" },
  { label: "Pinjaman", href: "/sdm/pinjaman", icon: PiggyBank, desc: "Pinjaman karyawan" },
  { label: "Hari Libur", href: "/sdm/hari-libur", icon: Palmtree, desc: "Hari libur" },
]

export default function HrmPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "SDM" }]} />
      <h1 id="sdm-heading" className="text-2xl font-bold text-foreground">
        SDM
      </h1>
      <ModuleGrid
        ariaLabel="Modul SDM"
        headingId="sdm-heading"
        items={hrmModules}
      />
    </div>
  )
}
