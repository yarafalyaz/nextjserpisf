import { prisma } from "@/lib/db/prisma"

/**
 * Pilihan pemasok & barang untuk form harga pemasok.
 *
 * Barang diambil aktif saja dan **tanpa batas** — memberi `take` akan membuat
 * barang di luar batas itu tidak bisa dipilih sama sekali (dan diam-diam "hilang"),
 * jadi lebih baik daftarnya lengkap; form pemilihnya sudah bisa dicari.
 */
export async function loadVendorPriceOptions() {
  const [vendors, items] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true },
    }),
  ])

  return {
    vendorOptions: vendors.map((vendor) => ({ value: String(vendor.id), label: vendor.name })),
    itemOptions: items.map((item) => ({ value: String(item.id), label: `${item.sku} — ${item.name}` })),
  }
}
