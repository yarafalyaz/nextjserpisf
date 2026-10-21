import type { ModuleItem } from "@/components/ui/module-grid"
import type { PermissionName } from "@/lib/setup/base-data"

import { navigation } from "./navigation"
import { NAV_CARD_DESCRIPTIONS } from "./nav-descriptions"

/**
 * Kartu halaman ringkasan modul (hub) DITURUNKAN dari `navigation.ts`, bukan ditulis
 * ulang di tiap halaman.
 *
 * Sebelumnya setiap hub (`/penjualan`, `/keuangan`, …) menyimpan array sendiri: label,
 * ikon, dan izin diduplikasi dari menu. Saat audit, 19 titik sudah menyimpang —
 * hub Pembelian masih menulis "Pesanan" padahal menunya "Pesanan Pembelian", hub
 * Keuangan menulis "Pengeluaran"/"Laporan Bank" padahal menunya "Biaya"/"Rekening Koran",
 * dan tiga halaman (Scan Barang, Baris Rak, Saldo Cuti) sama sekali tidak muncul di hub-nya.
 *
 * @param groupHref href grup di navigasi, mis. "/penjualan"
 */
export function moduleItemsForGroup(groupHref: string): ModuleItem[] {
  const group = navigation.find((item) => item.href === groupHref)
  if (!group?.children) {
    // Fail-closed: hub tanpa grup berarti nama halaman dan navigasi tidak sinkron.
    throw new Error(`Navigasi tidak punya grup "${groupHref}" — hub tidak bisa dibuat`)
  }

  return group.children.map((child) => ({
    label: child.label,
    href: child.href,
    icon: child.icon,
    desc: NAV_CARD_DESCRIPTIONS[child.href] ?? "",
    permission: child.permission,
    permissions: child.permissions,
  }))
}

/**
 * Izin yang membuat halaman hub ini layak dibuka: gabungan izin anak-anaknya
 * (any-of), menggantikan daftar izin yang dulu ditulis ulang per halaman.
 */
export function groupPermissions(groupHref: string): PermissionName[] {
  return moduleItemsForGroup(groupHref).flatMap((item) => [
    ...(item.permission ? [item.permission] : []),
    ...(item.permissions ?? []),
  ]) as PermissionName[]
}
