export const dynamic = "force-dynamic"

import { renderMaterialIssuesPage } from "../../page"
import { statusLabel, indoToStatus } from "@/lib/utils/status-labels"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ status: string }>
}): Promise<Metadata> {
  const { status } = await params
  const dbStatus = indoToStatus[status] || status
  return {
    title: `Pengeluaran Material - ${statusLabel(dbStatus)}`,
  }
}

export default async function MaterialIssueStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ status: string }>
  searchParams: Promise<{
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  const { status } = await params
  return renderMaterialIssuesPage({
    statusParam: status,
    searchParams,
  })
}
