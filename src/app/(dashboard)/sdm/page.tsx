import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  Clock, Palmtree, Timer, Banknote, CalendarDays, PiggyBank
} from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "SDM" }


const hrmModules = [
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
      <h1 className="text-2xl font-bold text-foreground">SDM</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {hrmModules.map((mod) => {
          const Icon = mod.icon
          return (
            <Link key={mod.href} href={mod.href} className="flex items-center gap-4 p-4 bg-surface rounded-xl border border-default shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <Icon size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                <p className="text-xs text-muted-foreground">{mod.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
