export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAppreciation } from "@/actions/hrm.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

const typeLabels: Record<string, string> = {
  bonus: "Bonus",
  reward: "Reward",
  incentive: "Insentif",
}

export default async function AppreciationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const appreciation = await prisma.appreciation.findUnique({
    where: { id: Number(id) },
    include: {
      employee: true,
    },
  })

  if (!appreciation) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Detail Apresiasi"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "HRM", href: "/sdm" },
          { label: "Apresiasi", href: "/sdm/apresiasi" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/sdm/apresiasi/${appreciation.id}/edit`} variant="primary">Edit</Button>
            <DeleteButton id={appreciation.id} action={deleteAppreciation} />
            <BackButton href="/sdm/apresiasi" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Karyawan" value={appreciation.employee.name} />
        <DetailField label="Tanggal" value={formatDate(appreciation.date)} />
        <DetailField label="Tipe" value={typeLabels[appreciation.type] || appreciation.type} />
        <DetailField label="Jumlah" value={formatCurrency(Number(appreciation.amount))} />
        {appreciation.notes && (
          <DetailField label="Catatan" value={appreciation.notes} colSpan="full" />
        )}
      </DetailCard>
    </div>
  )
}
