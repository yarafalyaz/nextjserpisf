export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
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
  await requirePermission("view_stock_opname")
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

  const sessions = await prisma.stocktakeSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      warehouse: { select: { code: true, name: true } },
      _count: { select: { lines: true } },
    },
  })

  // Seksi turunan baca-saja (F-2026-10-27-090-S): daftar existing di
  // atas tidak diubah; antrean menegakkan scope gudang di loadernya.
  const unfinishedQueue = await getStocktakeUnfinishedQueue()

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
        <StocktakeSessionForm />
        <div className="p-4 px-5">
          {sessions.length === 0 ? (
            <EmptyState title="Belum ada sesi opname" className="py-10" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Dokumen</DetailTableTh>
                <DetailTableTh>Gudang</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh>Baris</DetailTableTh>
                <DetailTableTh align="right">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {sessions.map((s) => (
                  <DetailTableRow key={s.id}>
                    <DetailTableTd>{s.documentNo}</DetailTableTd>
                    <DetailTableTd>
                      {s.warehouse.code} — {s.warehouse.name}
                    </DetailTableTd>
                    <DetailTableTd>{s.status}</DetailTableTd>
                    <DetailTableTd>{s._count.lines}</DetailTableTd>
                    <DetailTableTd align="right">
                      <div className="flex justify-end gap-2">
                        <a href={entityHref("/inventaris/opname/sesi", s)}>Buka</a>
                        <StocktakeActions id={s.id} status={s.status} />
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
