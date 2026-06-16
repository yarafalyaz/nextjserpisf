export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Akun" }

export default async function DetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_accounts")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const data = await prisma.account.findUnique({
    where: { id: numId }
  })

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Detail Akun"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Master Data", href: "/master/akun" },
          { label: "Akun", href: "/master/akun" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/akun/${data.id}/ubah`} variant="primary">Ubah</Button>
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
