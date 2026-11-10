export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import { PageHeader } from "@/components/ui/page-header"
import { entityHref } from "@/lib/utils/entity-url"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusChip } from "@/components/ui/status-chip"
import { StocktakeSessionForm, StocktakeActions } from "./_components/stocktake-forms"
import { getStocktakeUnfinishedQueue } from "@/lib/reports/stocktake-unfinished-queue-data"
import { StocktakeUnfinishedQueueCard } from "@/components/reports/stocktake-unfinished-queue-card"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Sesi Opname" }

/**
 * Sesi opname bertahap (P1-5): draft → snapshot → hitung → recount →
 * review → approve (independen) → posting variance jadi adjustment.
 * Menggantikan alur single-pass lama (hitung langsung → satu draft
 * adjustment tanpa snapshot/recount/approval).
 */
export default async function StocktakePage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const user = await requirePermission("view_stock_opname")
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  // ROUND5-SCOPE: daftar sesi hanya gudang dalam cakupan.
  const scopeWhere =
    scope.kind === "assigned"
      ? { warehouseId: { in: scope.warehouseIds } }
      : scope.kind === "none"
        ? { warehouseId: { in: [] as number[] } }
        : {}
  const [canCreate, canEdit] = await Promise.all([
    hasPermission("create_stock_adjustments"),
    hasPermission("edit_stock_adjustments"),
  ])
  const params = await searchParams

  // Tautan lama `?sessionId=<id>` → halaman sesi `/sesi/<slug>`.
  if (params.sessionId !== undefined) {
    const legacyId = Number(params.sessionId)
    const legacy =
      Number.isSafeInteger(legacyId) && legacyId > 0
        ? await prisma.stocktakeSession.findUnique({
            where: { id: legacyId },
            select: { slug: true },
          })
        : null
    redirect(
      legacy?.slug
        ? `/inventaris/opname/sesi/${legacy.slug}`
        : "/inventaris/opname/sesi",
    )
  }

  const [sessions, unfinishedQueue, warehouses] = await Promise.all([
    prisma.stocktakeSession.findMany({
      where: scopeWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        warehouse: { select: { code: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
    getStocktakeUnfinishedQueue(),
    prisma.warehouse.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(scope.kind === "assigned"
          ? { id: { in: scope.warehouseIds } }
          : scope.kind === "none"
            ? { id: { in: [] as number[] } }
            : {}),
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sesi Opname"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Sesi Opname" },
        ]}
      />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Sesi Baru</h2>
            <p className="text-xs text-muted-foreground">
              Buat sesi per gudang, lalu snapshot → hitung → recount → setujui → posting.
            </p>
          </div>
        </div>
        <StocktakeSessionForm canCreate={canCreate} warehouses={warehouses} />
        <div className="p-4 px-5">
          {sessions.length === 0 ? (
            <EmptyState title="Belum ada sesi opname" className="py-10" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Dokumen</DetailTableTh>
                <DetailTableTh>Gudang</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh align="right">Baris Item</DetailTableTh>
                <DetailTableTh align="right">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {sessions.map((s) => (
                  <DetailTableRow key={s.id}>
                    <DetailTableTd>
                      <span className="font-mono font-medium text-foreground">{s.documentNo}</span>
                    </DetailTableTd>
                    <DetailTableTd>
                      <span className="font-medium text-foreground">{s.warehouse.name}</span>
                      <span className="text-muted-foreground ml-1.5 font-mono text-xs">({s.warehouse.code})</span>
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip status={s.status} />
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      <span className="font-mono tabular-nums">{s._count.lines} baris</span>
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      <div className="flex justify-end items-center gap-2">
                        <a
                          href={entityHref("/inventaris/opname/sesi", s)}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
                        >
                          Buka
                        </a>
                        <StocktakeActions id={s.id} status={s.status} canCreate={canCreate} canEdit={canEdit} />
                      </div>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      <StocktakeUnfinishedQueueCard queue={unfinishedQueue} />
    </div>
  )
}
