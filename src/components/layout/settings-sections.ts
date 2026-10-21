import type { PermissionName } from "@/lib/setup/base-data"
import {
  Activity,
  BadgeDollarSign,
  Building2,
  ClipboardCheck,
  Cloud,
  Clock,
  DatabaseBackup,
  FileText,
  Hash,
  LockKeyhole,
  Repeat,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Timer,
  Users,
  Wallet,
  Workflow,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * Satu-satunya daftar halaman di hub Pengaturan (grup + kartu).
 *
 * Dulu daftar ini ditulis langsung di `src/app/(dashboard)/pengaturan/page.tsx` tanpa
 * izin per kartu, sehingga `/pengaturan/persetujuan` (yang butuh `approve_workflows`,
 * bukan `manage_settings`) tidak pernah terdaftar — hanya bisa dijangkau dari widget
 * notifikasi. Sekarang tiap kartu membawa izinnya sendiri (sama dengan guard halamannya,
 * dijaga tes `section-lists-parity.test.ts`), dan hub menyaring kartu sesuai izin
 * pengguna.
 */
export interface SettingsSectionItem {
  href: string
  label: string
  desc: string
  icon: LucideIcon
  /** Harus sama dengan `requirePermission()` di halaman tujuan. */
  permission: string
}

export interface SettingsSectionGroup {
  heading: string
  items: SettingsSectionItem[]
}

export const SETTINGS_SECTIONS: SettingsSectionGroup[] = [
  {
    heading: "Umum",
    items: [
      { href: "/pengaturan/proses-akhir-bulan", label: "Proses Akhir Bulan", desc: "Checklist tutup buku & kunci periode", icon: LockKeyhole, permission: "manage_settings" },
      { href: "/pengaturan/penyelesaian", label: "Penyelesaian Pengaturan", desc: "Checklist konfigurasi wajib", icon: ClipboardCheck, permission: "manage_settings" },
      { href: "/pengaturan/perusahaan", label: "Perusahaan", desc: "Identitas, alamat, logo perusahaan", icon: Building2, permission: "manage_settings" },
      { href: "/pengaturan/preferensi", label: "Preferensi", desc: "Mata uang, periode fiskal, metode HPP", icon: SlidersHorizontal, permission: "manage_settings" },
      { href: "/pengaturan/penomoran", label: "Penomoran Dokumen", desc: "Prefix & format nomor otomatis", icon: Hash, permission: "manage_settings" },
      { href: "/pengaturan/penawaran", label: "Penawaran", desc: "Tanda tangan & catatan kaki", icon: FileText, permission: "manage_settings" },
      { href: "/pengaturan/transaksi-favorit", label: "Transaksi Favorit", desc: "Pintasan pribadi ke transaksi yang sering dibuka", icon: Star, permission: "manage_favorite_transactions" },
    ],
  },
  {
    heading: "Akuntansi",
    items: [
      { href: "/pengaturan/mapping-akun", label: "Mapping Akun", desc: "Pemetaan akun untuk jurnal otomatis", icon: Wallet, permission: "manage_settings" },
      { href: "/pengaturan/pajak-potong", label: "Jenis PPh", desc: "Tarif & akun pemotongan PPh", icon: BadgeDollarSign, permission: "manage_withholding_tax" },
      { href: "/pengaturan/transaksi-berulang", label: "Transaksi Berulang", desc: "Jadwal dokumen otomatis (jurnal/beban draft)", icon: Repeat, permission: "manage_recurring_transactions" },
    ],
  },
  {
    heading: "SDM",
    items: [
      { href: "/pengaturan/lembur-kehadiran", label: "Lembur & Kehadiran", desc: "Parameter lembur, radius absensi", icon: Clock, permission: "manage_settings" },
    ],
  },
  {
    heading: "Akses & Keamanan",
    items: [
      { href: "/pengaturan/pengguna", label: "Pengguna", desc: "Kelola akun pengguna sistem", icon: Users, permission: "manage_users" },
      { href: "/pengaturan/peran", label: "Peran & Hak Akses", desc: "Kontrol hak akses berbasis peran", icon: Shield, permission: "manage_roles" },
      { href: "/pengaturan/log-aktivitas", label: "Log Aktivitas", desc: "Audit trail perubahan data", icon: Activity, permission: "manage_settings" },
    ],
  },
  {
    heading: "Otomasi",
    items: [
      { href: "/pengaturan/workflow", label: "Alur Persetujuan", desc: "Alur persetujuan dokumen", icon: Workflow, permission: "manage_settings" },
      { href: "/pengaturan/persetujuan", label: "Persetujuan", desc: "Daftar dokumen menunggu persetujuan", icon: ShieldCheck, permission: "approve_workflows" },
      { href: "/pengaturan/cron", label: "Jadwal Tugas", desc: "Cron job otomatisasi sistem", icon: Timer, permission: "manage_settings" },
    ],
  },
  {
    heading: "Sistem",
    items: [
      { href: "/pengaturan/penyimpanan", label: "Penyimpanan & CDN", desc: "Penyimpanan lokal / Cloudflare R2", icon: Cloud, permission: "manage_settings" },
      { href: "/pengaturan/database", label: "Cadangan & Pemulihan", desc: "Cadangkan & pulihkan database", icon: DatabaseBackup, permission: "manage_settings" },
    ],
  },
]

/** Semua izin yang membuat hub Pengaturan layak dibuka (any-of). */
export function settingsPermissions(): PermissionName[] {
  return [...new Set(SETTINGS_SECTIONS.flatMap((group) => group.items.map((item) => item.permission)))] as PermissionName[]
}
