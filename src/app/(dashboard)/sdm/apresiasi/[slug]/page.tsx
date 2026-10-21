export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAppreciation } from "@/actions/hrm.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Apresiasi" }

const typeLabels: Record<string, string> = {
  bonus: "Bonus",
  reward: "Imbalan",
  incentive: "Insentif",
}

export default async function AppreciationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_appreciations")

  const { slug } = await params

  const appreciation = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.appreciation.findFirst({ where: { slug: s }, include: { employee: true } }),
      byId: (id) => prisma.appreciation.findUnique({ where: { id }, include: { employee: true } }),
    },
  )

  if (!appreciation) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Detail Apresiasi"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Apresiasi", href: "/sdm/apresiasi" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="create_appreciations">
              <Button href={entityEditHref("/sdm/apresiasi", appreciation)} variant="primary">Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_appreciations">
              <DeleteButton id={appreciation.id} action={deleteAppreciation} />
            </CanCreate>
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
