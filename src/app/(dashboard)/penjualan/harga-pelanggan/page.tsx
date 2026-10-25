export const dynamic = "force-dynamic"

import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import {
  PRICE_LIST_EXPIRY_STATUS_LABELS,
  PRICE_LIST_EXPIRING_DEFAULT_WINDOW_DAYS,
  derivePriceListExpiryStatus,
  loadExpiringPriceListRows,
} from "@/lib/services/customer-price-list.service"
import { CustomerPriceTable } from "./_components/customer-price-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Daftar Harga Pelanggan" }

export default async function CustomerPricesPage() {
  await requirePermission("view_customer_price_lists")

  const referenceDate = getWibTodayUtcDate()

  const [prices, expiringPrices] = await Promise.all([
    prisma.customerPriceList.findMany({
      orderBy: [
        { customerCategoryId: "asc" },
        { itemId: "asc" },
        { minQty: "asc" },
        { effectiveDate: "asc" },
      ],
      take: 500,
      include: {
        customerCategory: { select: { name: true } },
        item: { select: { sku: true, name: true, unitOfMeasure: true } },
      },
    }),
    loadExpiringPriceListRows(prisma, {
      referenceDate,
      windowDays: PRICE_LIST_EXPIRING_DEFAULT_WINDOW_DAYS,
    }),
  ])

  const lookupById = new Map(prices.map((price) => [price.id, price]))

  const toRow = (price: (typeof prices)[number]) => {
    const expiryStatus = derivePriceListExpiryStatus(price, {
      referenceDate,
      expiringWindowDays: PRICE_LIST_EXPIRING_DEFAULT_WINDOW_DAYS,
    })
    return {
      id: price.id,
      categoryName: price.customerCategory?.name ?? "Umum",
      itemLabel: `${price.item.sku} — ${price.item.name}`,
      unit: price.item.unitOfMeasure,
      minQty: Number(price.minQty),
      price: Number(price.price),
      // ponytail: string ISO ke komponen klien; formatDate/formatCurrency/formatNumber diterapkan di tabel.
      effectiveDate: price.effectiveDate ? price.effectiveDate.toISOString() : null,
      expiresAt: price.expiresAt ? price.expiresAt.toISOString() : null,
      expiryStatus,
      expiryStatusLabel: PRICE_LIST_EXPIRY_STATUS_LABELS[expiryStatus],
      notes: price.notes,
    }
  }

  const rows = prices.map(toRow)
  const expiringRows = expiringPrices
    .map((row) => lookupById.get(row.id ?? 0))
    .filter((price): price is (typeof prices)[number] => Boolean(price))
    .map(toRow)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: "Daftar Harga Pelanggan" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Daftar Harga Pelanggan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daftar harga jual per kategori pelanggan dan barang, bertingkat menurut jumlah minimal.
            Harga terpilih otomatis dipakai faktur penjualan.
          </p>
        </div>
        <CanCreate permission="create_customer_price_lists">
          <Link
            href="/penjualan/harga-pelanggan/tambah"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover"
            id="create-customer-price-btn"
          >
            + Tambah Harga
          </Link>
        </CanCreate>
      </div>

      <CustomerPriceTable data={rows} expiringRows={expiringRows} />
    </div>
  )
}
