export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { BankStatementLineForm } from "../../_components/bank-statement-line-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Baris Rekening Koran" }

export default async function CreateBankStatementLinePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("create_journals")
  const { slug } = await params

  const stmt = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.bankStatement.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.bankStatement.findFirst({ where: { id, ...where } }),
    },
  )
  if (!stmt) notFound()

  const baseHref = `/keuangan/laporan-bank/${encodeURIComponent(slug)}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tambah Baris Rekening Koran"
        subtitle={`Rekening koran #${stmt.id}. Nominal selalu positif; arah mutasi yang menentukan kolomnya.`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Laporan Bank", href: "/keuangan/laporan-bank" },
          { label: "Detail", href: baseHref },
          { label: "Tambah Baris" },
        ]}
      />
      <FormCard>
        <BankStatementLineForm bankStatementId={stmt.id} baseHref={baseHref} />
      </FormCard>
    </div>
  )
}
