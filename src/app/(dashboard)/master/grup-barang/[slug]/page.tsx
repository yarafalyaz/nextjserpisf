export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Detail Grup Barang" }

export default async function ItemGroupDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_item_groups")

  const { slug } = await params
  const group = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.itemGroup.findFirst({
          where: { slug: s },
          include: { _count: { select: { items: true } } },
        }),
      byId: (id) =>
        prisma.itemGroup.findUnique({
          where: { id },
          include: { _count: { select: { items: true } } },
        }),
    },
  )

  if (!group) notFound()

  const rows: { label: string; value: string }[] = [
    { label: "Kode", value: group.code },
    { label: "Nama Grup", value: group.name },
    { label: "Deskripsi", value: group.description ?? "-" },
    { label: "Status", value: group.isActive ? "Aktif" : "Nonaktif" },
    { label: "Jumlah Barang", value: String(group._count.items) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Grup Barang", href: "/master/grup-barang" },
          { label: group.name },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{group.name}</h1>
        <CanCreate permission="edit_item_groups">
          <Link
            href={entityEditHref("/master/grup-barang", group)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
          >
            Ubah
          </Link>
        </CanCreate>
      </div>

      <dl className="bg-surface rounded-xl border border-default shadow-sm divide-y divide-default">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1 px-5 py-3">
            <dt className="text-sm font-medium text-muted-foreground">{row.label}</dt>
            <dd className="text-sm text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
