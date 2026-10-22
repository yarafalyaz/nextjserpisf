import { prisma } from "@/lib/db/prisma"

/**
 * Pilihan kategori pelanggan & barang untuk form daftar harga pelanggan.
 * Kategori opsional (kosong = harga umum semua kategori). Barang aktif saja
 * dan tanpa batas — pola loadVendorPriceOptions: `take` membuat barang di
 * luar batas tidak bisa dipilih sama sekali.
 */
export async function loadCustomerPriceOptions() {
  const [categories, items] = await Promise.all([
    prisma.customerCategory.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unitOfMeasure: true },
    }),
  ])

  return {
    categoryOptions: categories.map((category) => ({
      value: String(category.id),
      label: category.name,
    })),
    itemOptions: items.map((item) => ({
      value: String(item.id),
      label: `${item.sku} — ${item.name}`,
      unit: item.unitOfMeasure,
    })),
  }
}
