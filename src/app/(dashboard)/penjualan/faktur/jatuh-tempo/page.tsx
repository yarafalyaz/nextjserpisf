export const dynamic = "force-dynamic"

import { renderInvoicesPage } from "../page"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Faktur Jatuh Tempo" }

export default async function OverdueInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  return renderInvoicesPage(searchParams, true)
}
