export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  Building2,
  SlidersHorizontal,
  Hash,
  Clock,
  FileText,
  Wallet,
  Users,
  Workflow,
  Shield,
  Activity,
  ChevronRight,
  Timer,
  Cloud,
  DatabaseBackup,
} from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengaturan" }


const settingsNav = [
  {
    heading: "Umum",
    items: [
      { href: "/pengaturan/perusahaan", label: "Perusahaan", desc: "Identitas, alamat, logo perusahaan", icon: Building2 },
      { href: "/pengaturan/preferensi", label: "Preferensi", desc: "Mata uang, fiskal, costing method", icon: SlidersHorizontal },
      { href: "/pengaturan/penomoran", label: "Penomoran Dokumen", desc: "Prefix & format nomor otomatis", icon: Hash },
      { href: "/pengaturan/penawaran", label: "Penawaran", desc: "Tanda tangan & catatan kaki", icon: FileText },
    ],
  },
  {
    heading: "Akuntansi",
    items: [
      { href: "/pengaturan/mapping-akun", label: "Mapping Akun", desc: "Pemetaan akun untuk jurnal otomatis", icon: Wallet },
    ],
  },
  {
    heading: "SDM",
    items: [
      { href: "/pengaturan/lembur-kehadiran", label: "Lembur & Kehadiran", desc: "Parameter lembur, radius absensi", icon: Clock },
    ],
  },
  {
    heading: "Akses & Keamanan",
    items: [
      { href: "/pengaturan/pengguna", label: "Pengguna", desc: "Kelola akun pengguna sistem", icon: Users },
      { href: "/pengaturan/peran", label: "Peran & Hak Akses", desc: "Role-based access control", icon: Shield },
      { href: "/pengaturan/log-aktivitas", label: "Log Aktivitas", desc: "Audit trail perubahan data", icon: Activity },
    ],
  },
  {
    heading: "Otomasi",
    items: [
      { href: "/pengaturan/workflow", label: "Alur Persetujuan", desc: "Workflow approval dokumen", icon: Workflow },
      { href: "/pengaturan/cron", label: "Jadwal Tugas", desc: "Cron job otomatisasi sistem", icon: Timer },
    ],
  },
  {
    heading: "Sistem",
    items: [
      { href: "/pengaturan/penyimpanan", label: "Penyimpanan & CDN", desc: "Storage lokal / Cloudflare R2", icon: Cloud },
      { href: "/pengaturan/database", label: "Backup & Restore", desc: "Cadangkan & pulihkan database", icon: DatabaseBackup },
    ],
  },
]

export default async function SettingsPage() {
  await requirePermission("manage_settings")

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan" }]} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pengaturan</h1>
          <p className="text-sm text-muted-foreground">Kelola konfigurasi sistem, pengguna, dan keamanan.</p>
        </div>
      </div>

      <div className="space-y-8">
        {settingsNav.map((group) => (
          <div key={group.heading}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.heading}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
