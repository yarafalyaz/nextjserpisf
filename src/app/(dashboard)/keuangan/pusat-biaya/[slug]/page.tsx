export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import Link from "next/link"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteCostCenter } from "@/actions/finance.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { Pencil, ChevronRight } from "lucide-react"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
export const metadata: Metadata = { title: "Pusat Biaya" }

export default async function CostCenterDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_cost_centers")

  const { slug } = await params

  const costCenterInclude = {
    parent: { select: { id: true, slug: true, code: true, name: true } },
    children: { select: { id: true, slug: true, code: true, name: true }, orderBy: { code: "asc" as const } },
  }

  const costCenter = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.costCenter.findFirst({ where: { slug: s }, include: costCenterInclude }),
      byId: (id) => prisma.costCenter.findUnique({ where: { id }, include: costCenterInclude }),
    },
  )

  if (!costCenter) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pusat Biaya: ${costCenter.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Pusat Biaya", href: "/keuangan/pusat-biaya" },
          { label: costCenter.name },
        ]}
        actions={<>
          <Button href={entityEditHref("/keuangan/pusat-biaya", costCenter)} variant="primary"><Pencil size={14} /> Ubah</Button>
          <DeleteButton id={costCenter.id} action={deleteCostCenter} />
          <BackButton href="/keuangan/pusat-biaya" />
        </>}
      />

      <DetailCard>
        <DetailField label="Kode" value={costCenter.code} mono />
        <DetailField label="Nama" value={costCenter.name} />
        <DetailField label="Deskripsi" value={costCenter.description || "-"} />
        <DetailField label="Status" value={costCenter.isActive ? "Aktif" : "Nonaktif"} />
        <DetailField label="Induk" value={
          costCenter.parent
            ? <Link href={entityHref("/keuangan/pusat-biaya", costCenter.parent)} className="text-primary hover:underline">{costCenter.parent.code} — {costCenter.parent.name}</Link>
            : "-"
        } />
        <DetailField label="Dibuat" value={formatDate(costCenter.createdAt)} />
        <DetailField label="Diperbarui" value={formatDate(costCenter.updatedAt)} />
      </DetailCard>

      {costCenter.children.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">
            Sub Pusat Biaya ({costCenter.children.length})
          </h2>
          <div className="divide-y border-t">
            {costCenter.children.map((child) => (
              <Link key={child.id} href={entityHref("/keuangan/pusat-biaya", child)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground">{child.code}</span>
                  <span className="text-sm font-medium truncate">{child.name}</span>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
