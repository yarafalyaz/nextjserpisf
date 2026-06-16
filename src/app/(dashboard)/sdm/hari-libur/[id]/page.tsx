export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteHoliday } from "@/actions/hrm.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Hari Libur" }

export default async function HolidayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_employees")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const holiday = await prisma.holiday.findUnique({
    where: { id: numId },
  })

  if (!holiday) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hari Libur"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Hari Libur", href: "/sdm/hari-libur" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/sdm/hari-libur/${holiday.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={holiday.id} action={deleteHoliday} />
            <BackButton href="/sdm/hari-libur" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama" value={holiday.name} />
        <DetailField label="Tanggal" value={formatDate(holiday.date)} />
        {holiday.description && (
          <DetailField label="Deskripsi" value={holiday.description} colSpan="full" />
        )}
        <DetailField label="Dibuat" value={formatDate(holiday.createdAt)} />
      </DetailCard>
    </div>
  )
}
