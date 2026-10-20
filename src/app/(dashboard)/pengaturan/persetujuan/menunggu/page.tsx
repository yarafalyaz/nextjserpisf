export const dynamic = "force-dynamic"

import { renderApprovalsPage } from "../page"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Menunggu Persetujuan" }

export default async function PendingApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  return renderApprovalsPage(searchParams, true)
}
