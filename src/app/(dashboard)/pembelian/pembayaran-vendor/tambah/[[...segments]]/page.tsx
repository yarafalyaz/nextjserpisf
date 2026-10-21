export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VendorPaymentForm } from "@/components/forms/vendor-payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert"
import { getActivePaymentMethods } from "@/lib/services/method.service"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pembayaran Pemasok" }

const billHref = (slug: string) => `/pembelian/pembayaran-vendor/tambah/tagihan/${slug}`

export default async function CreateVendorPaymentPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ billId?: string }>
}) {
  await requirePermission("create_vendor_payments")

  const { billId } = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["tagihan"])

  // Tautan lama `?billId=` → bentuk path `tagihan/<slug>`.
  if (!seg.tagihan && billId !== undefined) {
    await redirectLegacyPrefillQuery(prisma.vendorBill, billId, billHref, "/pembelian/pembayaran-vendor/tambah")
  }
  const preselectedBillId = seg.tagihan
    ? await resolvePrefillId(prisma.vendorBill, seg.tagihan, billHref)
    : null

  const [vendors, bills, paymentMethods] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Hanya tagihan yang sudah dikonfirmasi (posted/partial) yang bisa
    // dibayar — sama dengan tombol Bayar di detail & tabel tagihan serta
    // penolakan createVendorPayment untuk konsep. Dulu daftar ini memakai
    // notIn [paid, cancelled] sehingga konsep ikut terbawa dan pembayaran
    // bisa lahir sebelum tagihannya diposting.
    prisma.vendorBill.findMany({
      where: { status: { in: ["posted", "partial"] }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true, vendorId: true, grandTotal: true, balanceDue: true },
    }),
    getActivePaymentMethods(),
  ])

  const requestedBillMissing =
    preselectedBillId !== null && !bills.some((bill) => bill.id === preselectedBillId)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pembelian", href: "/pembelian" },
  { label: "Pembayaran Pemasok", href: "/pembelian/pembayaran-vendor" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Pembayaran Pemasok</h1>
      </div>
      {requestedBillMissing && (
        <Alert>
          <AlertTitle>Pilihan awal tidak dipakai</AlertTitle>
          <AlertDescription>
            Tagihan #{preselectedBillId} tidak termasuk yang bisa dibayar (masih konsep,
            sudah lunas, dibatalkan, atau tidak ditemukan). Pilih tagihan langsung.
          </AlertDescription>
        </Alert>
      )}
      <VendorPaymentForm
        vendors={vendors}
        bills={JSON.parse(JSON.stringify(bills))}
        paymentMethods={paymentMethods}
        preselectedBillId={requestedBillMissing ? null : preselectedBillId}
      />
    </div>
  )
}
