export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import Link from "next/link"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Angka Kunci Statistik" }

export default async function DetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_statistical_key_figures")

  const { id } = await params

  const data = await prisma.statisticalKeyFigure.findUnique({
    where: { id: Number(id) }
  })

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Keuangan", href: "/keuangan/angka-kunci-statistik" },
        { label: "Angka Kunci Statistik", href: "/keuangan/angka-kunci-statistik" },
        { label: "Detail" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Detail Angka Kunci Statistik</h1>
        <Link href={`/keuangan/angka-kunci-statistik/${data.id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          Ubah
        </Link>
      </div>
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nama</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{String(data.name ?? "-")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Satuan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{String(data.unit ?? "-")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nilai</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{String(data.value ?? "-")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipe</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{String(data.type ?? "-")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
