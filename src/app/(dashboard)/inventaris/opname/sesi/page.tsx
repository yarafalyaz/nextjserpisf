export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { StocktakeSessionForm, StocktakeLineForm, StocktakeActions } from "./_components/stocktake-forms"

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

  const sessions = await prisma.stocktakeSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      warehouse: { select: { code: true, name: true } },
      _count: { select: { lines: true } },
    },
  })

  const activeId = Number(params.sessionId)
  const active = Number.isSafeInteger(activeId) && activeId > 0
    ? await prisma.stocktakeSession.findUnique({
        where: { id: activeId },
        include: {
          lines: {
            include: { item: { select: { sku: true, name: true, unitOfMeasure: true } } },
            orderBy: { id: "asc" },
            take: 500,
          },
        },
      })
    : null

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
            <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              Belum ada sesi opname
            </p>
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
                        <a href={`/inventaris/opname/sesi?sessionId=${s.id}`}>Buka</a>
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

      {active && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[0.9375rem] font-semibold text-foreground">
                {active.documentNo} — {active.status}
              </h2>
              <p className="text-xs text-muted-foreground">
                Snapshot sistem vs hitung fisik. Selisih tanpa recount masuk tahap recount.
              </p>
            </div>
          </div>
          <div className="p-4 px-5">
            <StocktakeLineForm sessionId={active.id} lines={active.lines.map((l) => ({
              id: l.id,
              sku: l.item.sku,
              name: l.item.name,
              systemQty: Number(l.systemQty),
              count1: l.count1 == null ? null : Number(l.count1),
              count2: l.count2 == null ? null : Number(l.count2),
            }))} />
          </div>
        </div>
      )}
    </div>
  )
}
