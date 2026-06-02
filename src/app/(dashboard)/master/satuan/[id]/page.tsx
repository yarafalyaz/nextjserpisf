/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

export default async function UomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const uom = await prisma.unitOfMeasure.findUnique({
    where: { id: Number(id) },
  })

  if (!uom) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Detail UoM`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data" },
          { label: "UoM", href: "/master/satuan" },
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
        <DetailField label="Nama" value={(uom as any).name ?? "-"} />
        <DetailField label="Kode" value={(uom as any).code ?? "-"} mono />
        <DetailField label="Deskripsi" value={(uom as any).description ?? "-"} colSpan="full" />
      </DetailCard>
    </div>
  )
}
