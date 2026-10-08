"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/shadcn/command"
import { Plus } from "lucide-react"
import {
  flattenNavigation,
  canSeeNavItem,
  type FlatNavEntry,
} from "@/components/layout/navigation"

// Shortcuts to common "create" screens. Kept separate from the navigation tree
// because these are actions (add forms), not places in the sidebar.
const quickActions: { label: string; href: string; permission?: string }[] = [
  { label: "Buat Pelanggan Baru", href: "/master/pelanggan/tambah", permission: "create_customers" },
  { label: "Buat Penawaran", href: "/penjualan/penawaran/tambah", permission: "create_quotations" },
  { label: "Buat Pesanan Penjualan", href: "/penjualan/pesanan/tambah", permission: "create_sales_orders" },
  { label: "Buat Faktur Penjualan", href: "/penjualan/faktur/tambah", permission: "create_sales_invoices" },
  { label: "Buat Pembayaran Faktur", href: "/penjualan/pembayaran/tambah", permission: "create_sales_payments" },
  { label: "Buat Surat Jalan", href: "/penjualan/surat-jalan/tambah", permission: "create_delivery_orders" },
  { label: "Buat Permintaan Pembelian", href: "/pembelian/permintaan/tambah", permission: "create_purchase_requests" },
  { label: "Buat Pesanan Pembelian", href: "/pembelian/pesanan/tambah", permission: "create_purchase_orders" },
  { label: "Buat Penerimaan Barang", href: "/pembelian/penerimaan/tambah", permission: "create_goods_receipts" },
  { label: "Buat Tagihan Vendor", href: "/pembelian/tagihan/tambah", permission: "create_vendor_bills" },
  { label: "Buat Pembayaran Vendor", href: "/pembelian/pembayaran-vendor/tambah", permission: "create_vendor_payments" },
  { label: "Buat Biaya", href: "/keuangan/pengeluaran/tambah", permission: "create_expenses" },
  { label: "Buat Entri Jurnal", href: "/keuangan/jurnal/tambah", permission: "create_journals" },
  { label: "Buat Proyek", href: "/proyek/tambah", permission: "create_projects" },
]

// Where each sidebar group's pages should appear in the palette, and in what
// order the groups themselves render.
const groupOrder = [
  "Aksi Cepat",
  "Navigasi",
  "Master Data",
  "Penjualan",
  "Pembelian",
  "Inventaris",
  "Manufaktur",
  "SDM",
  "Keuangan",
  "CRM",
  "Kendaraan",
  "Proyek",
  "Aset",
  "Laporan",
  "Lainnya",
]

export function CommandPalette() {
  const router = useRouter()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  const isSuperAdmin = session?.user?.roles?.includes("super_admin") ?? false
  const permissions = useMemo(
    () => session?.user?.permissions ?? [],
    [session?.user?.permissions],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  // Every navigable page, derived from the same navigation tree the sidebar
  // uses — so the palette can never miss a menu again — filtered to what this
  // user is actually allowed to open.
  const navEntries = useMemo<FlatNavEntry[]>(
    () =>
      flattenNavigation().filter((entry) =>
        canSeeNavItem(
          { label: entry.label, href: entry.href, icon: entry.icon, permission: entry.permission },
          permissions,
          isSuperAdmin,
        ),
      ),
    [permissions, isSuperAdmin],
  )

  const visibleQuickActions = useMemo(
    () =>
      quickActions.filter(
        (action) =>
          isSuperAdmin || !action.permission || permissions.includes(action.permission),
      ),
    [permissions, isSuperAdmin],
  )

  function handleSelect(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Pencarian Cepat"
      description="Cari menu, halaman, atau aksi"
      className="sm:max-w-2xl"
    >
      <CommandInput placeholder="Cari menu, halaman, atau aksi..." />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Tidak ditemukan. Coba kata kunci lain.</CommandEmpty>

        {visibleQuickActions.length > 0 && (
          <CommandGroup heading="Aksi Cepat">
            {visibleQuickActions.map((action) => (
              <CommandItem
                key={action.href}
                value={`${action.label} Aksi Cepat`}
                onSelect={() => handleSelect(action.href)}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupOrder
          .filter((group) => group !== "Aksi Cepat")
          .map((group) => {
            const items = navEntries.filter((i) => i.group === group)
            if (items.length === 0) return null
            return (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.href}
                      value={`${item.label} ${item.group}`}
                      onSelect={() => handleSelect(item.href)}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>{item.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )
          })}
      </CommandList>
    </CommandDialog>
  )
}
