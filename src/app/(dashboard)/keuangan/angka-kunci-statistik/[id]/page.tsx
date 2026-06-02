/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import Link from "next/link"

export default async function DetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.statisticalKeyFigure.findUnique({
    where: { id: Number(id) }
  })

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Finance", href: "/keuangan/angka-kunci-statistik" },
        { label: "Statistical Key Figure", href: "/keuangan/angka-kunci-statistik" },
        { label: "Detail" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Detail Statistical Key Figure</h1>
        <Link href={`/keuangan/angka-kunci-statistik/${data.id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          Edit
        </Link>
      </div>
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">name</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{String((data as any).name ?? "-")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">unit</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{String((data as any).unit ?? "-")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">value</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{String((data as any).value ?? "-")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">period</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{String((data as any).period ?? "-")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
