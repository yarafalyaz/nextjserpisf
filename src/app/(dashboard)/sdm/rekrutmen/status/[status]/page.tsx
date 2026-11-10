export const dynamic = "force-dynamic"

import { renderRecruitmentsPage } from "../../page"
import type { Metadata } from "next"

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Terbuka",
  closed: "Ditutup",
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ status: string }>
}): Promise<Metadata> {
  const { status } = await params
  return {
    title: `Rekrutmen - ${STATUS_LABELS[status] ?? status}`,
  }
}

export default async function RecruitmentStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ status: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await params
  return renderRecruitmentsPage({
    statusParam: status,
    searchParams,
  })
}
