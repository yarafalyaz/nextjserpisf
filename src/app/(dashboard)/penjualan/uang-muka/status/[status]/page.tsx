export const dynamic = "force-dynamic"

import { renderDownPaymentsPage } from "../../page"
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
    title: `Uang Muka - ${statusLabel(dbStatus)}`,
  }
}

export default async function DownPaymentStatusPage({
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
  return renderDownPaymentsPage({
    statusParam: status,
    searchParams,
  })
}
