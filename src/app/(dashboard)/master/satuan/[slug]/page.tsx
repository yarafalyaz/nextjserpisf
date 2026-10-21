export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DeleteButton } from "@/components/ui/delete-button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { deleteUom } from "@/actions/master.actions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Satuan" }

export default async function UomDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_units")

  const { slug } = await params

  const uom = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.unitOfMeasure.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.unitOfMeasure.findUnique({ where: { id } }),
    },
  )

  if (!uom) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Detail Satuan`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master" },
          { label: "Satuan", href: "/master/satuan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="edit_units">
              <Button href={entityEditHref("/master/satuan", uom)} variant="primary">Ubah</Button>
            </CanCreate>
            <CanCreate permission="edit_units">
              <DeleteButton id={uom.id} action={deleteUom} />
            </CanCreate>
            <BackButton href="/master/satuan" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Nama" value={uom.name ?? "-"} />
        <DetailField label="Simbol" value={uom.symbol ?? "-"} mono />
        <DetailField label="Kategori" value={uom.category ?? "-"} colSpan="full" />
      </DetailCard>
    </div>
  )
}
