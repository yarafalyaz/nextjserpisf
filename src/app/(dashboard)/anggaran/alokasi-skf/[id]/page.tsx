export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export const metadata = { title: "Detail Aturan Alokasi" }

export default async function AllocationRuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_statistical_key_figures")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const rule = await prisma.allocationRule.findUnique({
    where: { id: numId },
    include: {
      sourceAccount: { select: { id: true, code: true, name: true } },
      skf: { select: { id: true, name: true, code: true, unit: true } },
      targets: { include: { costCenter: { select: { id: true, code: true, name: true } } } },
    },
  })
  if (!rule) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Anggaran" },
        { label: "Alokasi Key Figure", href: "/anggaran/alokasi-skf" },
        { label: rule.name },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{rule.name}</h1>
      </div>
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
            <span className="text-sm font-medium">{rule.isActive ? "Aktif" : "Nonaktif"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Akun Sumber</span>
            <span className="text-sm font-medium">{rule.sourceAccount.code} — {rule.sourceAccount.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Key Figure</span>
            <span className="text-sm font-medium">{rule.skf.code ? `${rule.skf.code} — ` : ""}{rule.skf.name} ({rule.skf.unit})</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deskripsi</span>
            <span className="text-sm font-medium">{rule.description ?? "-"}</span>
          </div>
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-3">Target Pusat Biaya</h2>
        {rule.targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Semua pusat biaya aktif</p>
        ) : (
          <ul className="space-y-1">
            {rule.targets.map((t) => (
              <li key={t.id} className="text-sm">{t.costCenter.code} — {t.costCenter.name}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
