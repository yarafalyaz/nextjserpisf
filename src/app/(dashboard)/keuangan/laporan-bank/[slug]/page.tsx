export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { formatDate } from "@/lib/utils/format"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laporan Bank" }

export default async function BankStatementDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_bank_statements")
  const { slug } = await params

  const stmt = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.bankStatement.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.bankStatement.findFirst({ where: { id, ...where } }),
    },
  )
  if (!stmt) notFound()

  const account = stmt.accountId
    ? await prisma.account.findUnique({ where: { id: stmt.accountId }, select: { code: true, name: true } })
    : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Laporan Bank #${stmt.id}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Laporan Bank", href: "/keuangan/laporan-bank" },
          { label: "Detail" },
        ]}
        actions={<BackButton href="/keuangan/laporan-bank" />}
      />

      <DetailCard>
        <DetailField label="Akun Bank" value={account ? `${account.code} - ${account.name}` : `Account #${stmt.accountId}`} />
        <DetailField label="Tanggal" value={formatDate(stmt.date)} />
        <DetailField label="Referensi" value={stmt.reference || "-"} />
        <DetailField label="Dibuat" value={formatDate(stmt.createdAt)} />
      </DetailCard>
    </div>
  )
}
