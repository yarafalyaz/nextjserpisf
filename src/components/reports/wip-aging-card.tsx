import Link from "next/link"
import type { WipAging } from "@/lib/reports/wip-aging"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-20-72 (tahap frontend): umur WIP per order produksi berjalan.
 *
 * Data dari builder read-only `buildWipAging` + loader `getWipAging`
 * (PR #238): sisa WIP = totalActualCost − releasedCost per order berjalan,
 * ember umur 0-30/31-60/61-90/>90 hari. Komponen ini murni presentasi —
 * tidak menghitung ulang biaya dan tidak menyentuh jurnal.
 */
export function WipAgingCard({ aging }: Readonly<{ aging: WipAging }>) {
  return (
    <ReportCardShell
      label="Umur WIP Berjalan"
      title="Umur WIP Berjalan"
      summary={
        <>
          {aging.totalOrders} order produksi berjalan · sisa WIP{" "}
          {formatCurrency(aging.totalWipAmount)}
        </>
      }
      isEmpty={aging.orders.length === 0}
      emptyText="Belum ada order produksi berjalan"
    >
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>No. Order</DetailTableTh>
          <DetailTableTh>Produk</DetailTableTh>
          <DetailTableTh>Perintah Kerja</DetailTableTh>
          <DetailTableTh>Status</DetailTableTh>
          <DetailTableTh align="right">Umur (hari)</DetailTableTh>
          <DetailTableTh>Ember Umur</DetailTableTh>
          <DetailTableTh align="right">Selesai (%)</DetailTableTh>
          <DetailTableTh align="right">Sisa WIP</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {aging.orders.map((order) => (
            <DetailTableRow key={order.id}>
              <DetailTableTd>
                <Link
                  href={entityHref("/produksi/production-orders", order)}
                  className="font-medium text-primary hover:underline"
                >
                  {order.documentNo}
                </Link>
              </DetailTableTd>
              <DetailTableTd>{order.productName}</DetailTableTd>
              <DetailTableTd>{order.workOrderDocumentNo ?? "–"}</DetailTableTd>
              <DetailTableTd>{statusLabel(order.status)}</DetailTableTd>
              <DetailTableTd align="right">{formatNumber(order.ageDays)}</DetailTableTd>
              <DetailTableTd>
                {aging.buckets.find((bucket) => bucket.id === order.bucket)?.label ?? order.bucket}
              </DetailTableTd>
              <DetailTableTd align="right">
                {formatNumber(order.completionPercent, 2)}%
              </DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(order.wipAmount)}</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
      <section aria-label="Ringkasan Ember Umur WIP" className="mt-5">
        <h3 className="text-sm font-semibold text-foreground">Ringkasan Ember Umur</h3>
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>Ember Umur</DetailTableTh>
            <DetailTableTh align="right">Jumlah Order</DetailTableTh>
            <DetailTableTh align="right">Sisa WIP</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {aging.buckets.map((bucket) => (
              <DetailTableRow key={bucket.id}>
                <DetailTableTd>{bucket.label}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(bucket.orderCount)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(bucket.wipAmount)}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </section>
    </ReportCardShell>
  )
}
