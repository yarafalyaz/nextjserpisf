export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

export default async function DetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.account.findUnique({
    where: { id: Number(id) }
  })

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Detail Akun"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master/akun" },
          { label: "Akun", href: "/master/akun" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/akun/${data.id}/edit`} variant="primary">Edit</Button>
            <BackButton href="/master/akun" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Kode" value={String(data.code ?? "-")} mono />
        <DetailField label="Nama" value={String(data.name ?? "-")} />
        <DetailField label="Tipe" value={String(data.type ?? "-")} />
        <DetailField label="Status" value={data.isActive ? "Aktif" : "Nonaktif"} />
      </DetailCard>
    </div>
  )
}
