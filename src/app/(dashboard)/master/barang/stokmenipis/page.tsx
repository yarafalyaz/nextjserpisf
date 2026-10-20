export const dynamic = "force-dynamic"

import { renderItemsPage } from "../page"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Stok Menipis" }

export default async function LowStockItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; category?: string; halaman?: string; pageSize?: string }>
}) {
  return renderItemsPage(searchParams, true)
}
