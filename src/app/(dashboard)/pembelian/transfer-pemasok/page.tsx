export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { VendorTransferPanel, type TransferInstructionRow } from "./_components/vendor-transfer-panel"

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

function resolveMonth(periode: string | undefined): { start: Date; end: Date; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec((periode ?? "").trim())
  const now = new Date()
  const year = match ? Number(match[1]) : now.getFullYear()
  const month = match ? Number(match[2]) - 1 : now.getMonth()
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
    label: `${MONTHS_ID[month]} ${year}`,
  }
}

export default async function VendorTransferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermission("view_vendor_payments")

  const params = await searchParams
  const month = resolveMonth(params.periode)

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

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Transfer Pemasok" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Transfer Pemasok</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Daftar instruksi transfer bank ke pemasok untuk pembayaran yang tercatat pada {month.label} —
          termasuk yang masih berstatus draft (belum dikonfirmasi, jadi jurnalnya belum dibuat).
          Menandai transfer tidak membuat jurnal.
        </p>
      </div>

      <VendorTransferPanel rows={rows} />
    </div>
  )
}
