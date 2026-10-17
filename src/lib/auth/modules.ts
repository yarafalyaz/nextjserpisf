/**
 * Registri modul + aksi untuk matriks izin (Pengaturan → Peran).
 *
 * SUMBER TUNGGAL adalah daftar `PERMISSIONS` di `src/lib/setup/base-data.ts`. Registri
 * ini hanya MENGELOMPOKKAN dan memberi label permission yang sama, supaya UI bisa
 * menampilkannya sebagai matriks: baris = entitas (`resource`), kolom = verba (`key`).
 *
 * Yang ditegakkan tetap `Role.permissions` → `session.user.permissions`
 * (`src/lib/auth/auth.ts`), dibaca oleh 300+ pemanggilan `requirePermission()`. Halaman
 * matriks menulis ke `Role.permissions` lewat action `updateRole`, jadi tidak ada lagi
 * katalog yang "dekoratif".
 *
 * `actions` di bawah TIDAK ditulis tangan: dihasilkan `scripts/generate-module-catalog.mjs`
 * dari daftar permission (sebelumnya hanya 80 dari 301 permission yang terpetakan, dan
 * `@@unique([moduleId, key])` membuat katalog DB kehilangan baris).
 *
 * Dipakai oleh:
 *   - src/lib/setup/modules.ts      → menulis tabel `modules` + `module_actions`
 *   - pengaturan/peran/[slug]/modul → matriks izin
 *
 * Menambah modul: tambahkan entitas→modul di skrip generator, jalankan skrip, tambahkan
 * metadata modul di `MODULE_META`, lalu `npx tsx prisma/seed-modules.ts` (atau `npm run db:seed`).
 */

import {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { MODULE_ACTIONS, type CatalogAction, type CatalogVerb } from "./module-catalog.generated"

export type { CatalogAction, CatalogVerb }

/** Satu baris matriks: permission + tempatnya (modul, entitas, verba). */
export type ModuleActionDef = CatalogAction

export interface ModuleDef {
  key: string
  name: string
  parentKey?: string
  route?: string
  icon?: string
  order: number
  actions: ModuleActionDef[]
}

/** Metadata modul (hand-written); aksinya diambil dari katalog hasil generate. */
const MODULE_META: Omit<ModuleDef, "actions">[] = [
  { key: "dashboard", name: "Dasbor", route: "/", icon: "LayoutDashboard", order: 0 },
  { key: "master", name: "Data Master", route: "/master", icon: "ClipboardList", order: 10 },
  { key: "sales", name: "Penjualan", route: "/penjualan", icon: "DollarSign", order: 20 },
  { key: "purchase", name: "Pembelian", route: "/pembelian", icon: "ShoppingBag", order: 30 },
  { key: "inventory", name: "Inventaris", route: "/inventaris", icon: "Package", order: 40 },
  { key: "manufacturing", name: "Manufaktur", route: "/produksi", icon: "Settings2", order: 50 },
  { key: "hrm", name: "SDM", route: "/sdm", icon: "Users", order: 60 },
  { key: "finance", name: "Keuangan", route: "/keuangan", icon: "Landmark", order: 70 },
  { key: "crm", name: "CRM", route: "/crm", icon: "Handshake", order: 80 },
  { key: "vehicles", name: "Kendaraan", route: "/kendaraan", icon: "Car", order: 90 },
  { key: "projects", name: "Proyek", route: "/proyek", icon: "FolderKanban", order: 100 },
  { key: "assets", name: "Aset", route: "/aset", icon: "HardDrive", order: 110 },
  { key: "reports", name: "Laporan", route: "/laporan", icon: "TrendingUp", order: 120 },
  { key: "calendar", name: "Kalender", route: "/kalender", icon: "CalendarDays", order: 130 },
  { key: "settings", name: "Pengaturan", route: "/pengaturan", icon: "Cog", order: 999 },
]

export const MODULES: ModuleDef[] = MODULE_META.map((meta) => {
  const actions = MODULE_ACTIONS[meta.key]
  if (!actions) {
    // Fail-closed: modul tanpa aksi berarti metadata dan katalog tidak sinkron.
    throw new Error(`Katalog izin tidak memuat aksi untuk modul "${meta.key}"`)
  }
  return { ...meta, actions }
})

/** Map icon name → component. Used by sidebar to render module icons from DB rows. */
export const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign,
}
