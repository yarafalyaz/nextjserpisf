import { prisma } from "@/lib/db/prisma"
import type { ReportSelectFilter } from "@/components/reports/report-period-filter"
import { ReportKpiCard } from "@/components/reports/report-section"

/**
 * Bagian bersama halaman Riwayat Harga Penawaran (039-S) dan Riwayat
 * Harga Jual (028-S): pilihan pelanggan/barang aktif + saringan filter.
 * Murni plumbing presentasi/loader pilihan — payload laporan tetap dari
 * builder masing-masing domain, UI tidak menghitung ulang.
 */
export interface PriceHistorySelectionOption {
  id: number
  code?: string
  name: string
  sku?: string
  slug: string | null
}

export async function loadPriceHistorySelection(customerKey: string | null, itemKey: string | null) {
  const [customers, items] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, slug: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, slug: true },
    }),
  ])

  const selectedCustomer = customerKey
    ? (customers.find((c) => c.slug === customerKey) ??
      customers.find((c) => String(c.id) === customerKey) ??
      null)
    : null
  const selectedItem = itemKey
    ? (items.find((i) => i.slug === itemKey) ?? items.find((i) => String(i.id) === itemKey) ?? null)
    : null

  return { customers, items, selectedCustomer, selectedItem }
}

export function priceHistorySelects({
  customers,
  items,
  selectedCustomer,
  selectedItem,
}: Awaited<ReturnType<typeof loadPriceHistorySelection>>): ReportSelectFilter[] {
  return [
    {
      param: "pelanggan",
      label: "Pelanggan",
      placeholder: "Cari pelanggan...",
      required: true,
      value: selectedCustomer ? (selectedCustomer.slug ?? String(selectedCustomer.id)) : "",
      options: customers.map((c) => ({
        value: c.slug ?? String(c.id),
        label: `${c.code} - ${c.name}`,
      })),
    },
    {
      param: "barang",
      label: "Barang",
      placeholder: "Semua Barang",
      value: selectedItem ? (selectedItem.slug ?? String(selectedItem.id)) : "",
      options: items.map((i) => ({
        value: i.slug ?? String(i.id),
        label: `${i.sku} - ${i.name}`,
      })),
    },
  ]
}

export function PriceHistoryTruncatedNote({
  jumlahTampil,
  jumlahTotal,
  maxPerPair,
}: {
  jumlahTampil: number
  jumlahTotal: number
  maxPerPair: number
}) {
  return (
    <p className="doc-lines">
      Menampilkan {jumlahTampil} dari {jumlahTotal} kejadian terbaru (batas {maxPerPair} kejadian
      per pasangan).
    </p>
  )
}

export function PriceHistoryTruncatedKpi({ terpotong }: { terpotong: boolean }) {
  return <ReportKpiCard label="Kejadian Terpotong" value={terpotong ? "Ada" : "Tidak ada"} />
}
