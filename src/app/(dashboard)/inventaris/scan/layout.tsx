import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"

export const metadata: Metadata = { title: "Scan Barcode" }

export default async function Layout({ children }: { children: React.ReactNode }) {
  // page.tsx adalah komponen client sehingga tak bisa memanggil requirePermission
  // sendiri; sidebar menampilkan "Scan Barang" hanya dengan view_inventory.
  await requirePermission("view_inventory")
  return children
}
