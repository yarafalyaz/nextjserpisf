export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { VendorTransferPanel, type TransferInstructionRow } from "../_components/vendor-transfer-panel"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Transfer Pemasok" }

const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

function monthParam(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`
}

function resolveMonth(periode: string | undefined): { start: Date; end: Date; label: string; year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec((periode ?? "").trim())
  const now = new Date()
  const year = match ? Number(match[1]) : now.getFullYear()
  const month = match ? Number(match[2]) - 1 : now.getMonth()
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
    label: `${MONTHS_ID[month]} ${year}`,
    year,
    month,
  }
}

/**
 * Segmen path `bulan/<YYYY-MM>` → bulan yang ditampilkan. Kunci tak dikenal
 * atau nilai rusak adalah URL salah (404), pola yang sama dengan halaman
 * periode lain. Tanpa segmen = bulan berjalan.
 */
function parseSegments(segments: string[] | undefined): { periode?: string } {
  if (!segments?.length) return {}
  if (segments.length % 2 !== 0) notFound()
  const parsed: { periode?: string } = {}
  for (let i = 0; i < segments.length; i += 2) {
    const key = segments[i]
    const value = segments[i + 1]
    if (key === "bulan" && /^(\d{4})-(\d{2})$/.test(value)) parsed.periode = value
    else notFound()
  }
  return parsed
}

export default async function VendorTransferPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermission("view_vendor_payments")

  const params = await searchParams
  const { segments } = await routeParams
  const { periode } = parseSegments(segments)

  // Tautan lama `?periode=<YYYY-MM>` → bentuk path `bulan/<YYYY-MM>`.
  if (params.periode !== undefined && periode === undefined) {
    redirect(
      /^(\d{4})-(\d{2})$/.test(params.periode)
        ? `/pembelian/transfer-pemasok/bulan/${params.periode}`
        : "/pembelian/transfer-pemasok",
    )
  }

  const month = resolveMonth(periode)

  const payments = await prisma.vendorPayment.findMany({
    where: {
      deletedAt: null,
      // Draft IKUT disertakan: daftar ini instruksi transfer (uang belum dikirim), dan
      // pembayaran yang belum dieksekusi justru draft. `confirmVendorPayment` ada di aksi
      // tetapi belum tersambung ke UI mana pun, jadi menyaring draft membuat daftar ini
      // selalu kosong. Statusnya ditampilkan supaya jelas mana yang belum berjurnal.
      paymentDate: { gte: month.start, lte: month.end },
    },
    orderBy: [{ transferredAt: "asc" }, { paymentDate: "asc" }],
    select: {
      id: true,
      documentNo: true,
      paymentDate: true,
      paymentMethod: true,
      bankAccount: true,
      referenceNumber: true,
      amount: true,
      status: true,
      transferredAt: true,
      transferReference: true,
      vendor: { select: { name: true } },
    },
  })

  const rows: TransferInstructionRow[] = payments.map((payment) => ({
    id: payment.id,
    documentNo: payment.documentNo,
    paymentDate: payment.paymentDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
    vendorName: payment.vendor.name,
    paymentMethod: payment.paymentMethod,
    bankAccount: payment.bankAccount,
    referenceNumber: payment.referenceNumber,
    amount: Number(payment.amount),
    status: payment.status,
    transferredAt: payment.transferredAt
      ? payment.transferredAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
      : null,
    transferReference: payment.transferReference,
  }))

  const prev = month.month === 0 ? { year: month.year - 1, month: 11 } : { year: month.year, month: month.month - 1 }
  const next = month.month === 11 ? { year: month.year + 1, month: 0 } : { year: month.year, month: month.month + 1 }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Transfer Pemasok" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transfer Pemasok</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daftar instruksi transfer bank ke pemasok untuk pembayaran yang tercatat pada {month.label} —
            termasuk yang masih berstatus draft (belum dikonfirmasi, jadi jurnalnya belum dibuat).
            Menandai transfer tidak membuat jurnal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/pembelian/transfer-pemasok/bulan/${monthParam(prev.year, prev.month)}`} className="px-3 py-2 rounded-lg text-sm border border-default hover:bg-surface-muted">← Sebelumnya</Link>
          <Link href="/pembelian/transfer-pemasok" className="px-3 py-2 rounded-lg text-sm border border-default hover:bg-surface-muted">Bulan ini</Link>
          <Link href={`/pembelian/transfer-pemasok/bulan/${monthParam(next.year, next.month)}`} className="px-3 py-2 rounded-lg text-sm border border-default hover:bg-surface-muted">Berikutnya →</Link>
        </div>
      </div>

      <VendorTransferPanel rows={rows} />
    </div>
  )
}
