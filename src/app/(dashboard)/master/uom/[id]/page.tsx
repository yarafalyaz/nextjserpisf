export const dynamic = "force-dynamic"

import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function UomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Master Data" },
        { label: "UoM", href: "/master/uom" },
        { label: "Detail" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Detail UoM</h1>
        <div className="flex gap-2">
          <Link href={`/master/uom/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <p className="text-muted">UoM ID: {id}</p>
      </div>
    </div>
  )
}
