export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteHoliday } from "@/actions/hrm.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

export default async function HolidayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const holiday = await prisma.holiday.findUnique({
    where: { id: Number(id) },
  })

  if (!holiday) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hari Libur"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "HRM", href: "/sdm" },
          { label: "Hari Libur", href: "/sdm/hari-libur" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/hrm/holidays/${holiday.id}/edit`} variant="primary">Edit</Button>
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
