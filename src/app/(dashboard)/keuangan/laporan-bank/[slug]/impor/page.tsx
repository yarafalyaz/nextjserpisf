export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { PageHeader } from "@/components/ui/page-header"
import { FormCard } from "@/components/ui/form-section"
import { BankStatementImportForm } from "../_components/bank-statement-import-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Import CSV Rekening Koran" }

export default async function ImportBankStatementLinesPage({
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
        title="Import CSV Rekening Koran"
        subtitle={`Rekening koran #${stmt.id}. Import atomik: satu baris rusak menolak seluruh berkas.`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Laporan Bank", href: "/keuangan/laporan-bank" },
          { label: "Detail", href: baseHref },
          { label: "Import CSV" },
        ]}
      />
      <FormCard>
        <BankStatementImportForm bankStatementId={stmt.id} baseHref={baseHref} />
      </FormCard>
    </div>
  )
}
