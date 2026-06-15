export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Satuan" }

export default async function UomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_units")

  const { id } = await params

  const uom = await prisma.unitOfMeasure.findUnique({
    where: { id: Number(id) },
  })

  if (!uom) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Detail Satuan`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Master Data" },
          { label: "Satuan", href: "/master/satuan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/satuan/${id}/ubah`} variant="primary">Ubah</Button>
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
