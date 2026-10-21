export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { StocktakeLineForm, StocktakeActions } from "../_components/stocktake-forms"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Sesi Opname" }

/**
 * Workspace satu sesi opname. Dulu dirender inline di halaman daftar lewat
 * `?sessionId=` — URL identitas itu kini path `/sesi/<slug>` seperti detail
 * lain (tautan lama diarahkan ke sini oleh halaman daftar).
 */
export default async function StocktakeSessionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_stock_opname")
  const { slug } = await params

  const session = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s, where) =>
        prisma.stocktakeSession.findFirst({
          where: { slug: s, ...where },
          include: {
            warehouse: { select: { code: true, name: true } },
            lines: {
              include: { item: { select: { sku: true, name: true, unitOfMeasure: true } } },
              orderBy: { id: "asc" },
              take: 500,
            },
          },
        }),
      byId: (id, where) =>
        prisma.stocktakeSession.findUnique({
          where: { id, ...where },
          include: {
            warehouse: { select: { code: true, name: true } },
            lines: {
              include: { item: { select: { sku: true, name: true, unitOfMeasure: true } } },
              orderBy: { id: "asc" },
              take: 500,
            },
          },
        }),
    },
  )

  if (!session) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${session.documentNo} — ${session.status}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Sesi Opname", href: "/inventaris/opname/sesi" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <StocktakeActions id={session.id} status={session.status} />
            <BackButton href="/inventaris/opname/sesi" />
          </>
        }
      />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              {session.warehouse.code} — {session.warehouse.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              Snapshot sistem vs hitung fisik. Selisih tanpa recount masuk tahap recount.
            </p>
          </div>
        </div>
        <div className="p-4 px-5">
          <StocktakeLineForm sessionId={session.id} lines={session.lines.map((l) => ({
            id: l.id,
            sku: l.item.sku,
            name: l.item.name,
            systemQty: Number(l.systemQty),
            count1: l.count1 == null ? null : Number(l.count1),
            count2: l.count2 == null ? null : Number(l.count2),
          }))} />
        </div>
      </div>
    </div>
  )
}
