export const dynamic = "force-dynamic"

import { renderAttendanceCorrectionsPage } from "../../page"
import { statusLabel, indoToStatus } from "@/lib/utils/status-labels"
import { ATTENDANCE_CORRECTION_TITLE } from "../../../_components/attendance-correction-table"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ status: string }>
}): Promise<Metadata> {
  const { status } = await params
  const dbStatus = indoToStatus[status] || status
  return {
    title: `${ATTENDANCE_CORRECTION_TITLE} - ${statusLabel(dbStatus)}`,
  }
}

export default async function AttendanceCorrectionStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ status: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await params
  return renderAttendanceCorrectionsPage({
    statusParam: status,
    searchParams,
  })
}
