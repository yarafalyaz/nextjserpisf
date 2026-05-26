export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAssetTransfer } from "@/actions/asset.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_assets")
  const { id } = await params

  const asset = await prisma.asset.findUnique({
    where: { id: Number(id) },
    include: {
      category: true,
      group: true,
      histories: { orderBy: { date: "desc" }, take: 10 },
      transfers: { orderBy: { transferDate: "desc" }, take: 5 },
    },
  })

  if (!asset) notFound()

  const depreciation = Number(asset.purchaseCost) - Number(asset.currentValue)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Assets", href: "/assets" },
  { label: "[id]" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{asset.name}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={asset.status} />
  <div className="flex gap-2">
          <Link href={`/assets/${asset.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={asset.id} action={deleteAssetTransfer} />
                  <Link href="/assets" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Kode Aset</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{asset.code}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Kategori</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{asset.category?.name || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Grup</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{asset.group?.name || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Lokasi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{asset.location || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Beli</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(asset.purchaseDate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nilai Beli</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(asset.purchaseCost))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nilai Saat Ini</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(asset.currentValue))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Akumulasi Penyusutan</span>
            <span className="text-[0.9375rem] text-foreground font-medium text-danger">{formatCurrency(depreciation)}</span>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Aset</h2>
        </div>
        <div className="p-4 px-5">
          {asset.histories.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada riwayat</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr><th>Tanggal</th><th>Tipe</th><th>Deskripsi</th><th style={{ textAlign: "right" }}>Nilai</th></tr>
              </thead>
              <tbody>
                {asset.histories.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDate(h.date)}</td>
                    <td><span className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground cursor-pointer transition-all capitalize hover:border-primary hover:text-primary">{h.type}</span></td>
                    <td>{h.description || "-"}</td>
                    <td className="text-right">{h.amount ? formatCurrency(Number(h.amount)) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Transfers */}
      {asset.transfers.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Transfer</h2>
          </div>
          <div className="p-4 px-5">
            <table className="w-full border-collapse">
              <thead>
                <tr><th>Tanggal</th><th>Dari</th><th>Ke</th><th>Catatan</th></tr>
              </thead>
              <tbody>
                {asset.transfers.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.transferDate)}</td>
                    <td>{t.fromLocation || "-"}</td>
                    <td>{t.toLocation}</td>
                    <td>{t.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
