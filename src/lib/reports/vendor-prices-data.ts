/**
 * Pemuatan data laporan **Harga Pemasok** — daftar rujukan (tanpa periode).
 */

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import {
  buildVendorPriceListing,
  type VendorPriceInput,
  type VendorPriceResult,
} from "@/lib/reports/vendor-prices"

export interface VendorPricesReport {
  result: VendorPriceResult
  asOfLabel: string
}

export async function loadVendorPrices(): Promise<VendorPricesReport> {
  const prices = await prisma.vendorItemPrice.findMany({
    where: { isActive: true },
    include: {
      vendor: { select: { name: true } },
      item: { select: { sku: true, name: true } },
    },
    orderBy: [{ vendorId: "asc" }, { itemId: "asc" }, { minQty: "asc" }],
  })

  const rows: VendorPriceInput[] = prices.map((price) => ({
    vendorName: price.vendor.name,
    itemKey: String(price.itemId),
    itemLabel: `${price.item.sku} — ${price.item.name}`,
    minQty: Number(price.minQty),
    price: Number(price.price),
    effectiveDate: price.effectiveDate,
  }))

  return {
    result: buildVendorPriceListing(rows),
    asOfLabel: formatDate(new Date()),
  }
}
