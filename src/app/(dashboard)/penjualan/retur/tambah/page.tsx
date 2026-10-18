export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { SalesReturnForm } from "@/components/forms/sales-return-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReturnPrefill, type ReturnPrefill } from "../_lib/return-prefill"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Retur" }

export default async function CreateSalesReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>
}) {
  await requirePermission("create_sales_returns")

  const params = await searchParams
  const requestedInvoiceId = Number(params.invoiceId)

  const [invoices, customers, items] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: ["posted", "sent"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true },
    }),
  ])

  // Jalur "buat dari" faktur: `?invoiceId=` dari halaman detail faktur. Faktur,
  // pelanggan, dan baris barangnya (sisa yang boleh diretur = qty difakturkan −
  // qty yang sudah diretur pada retur yang tidak dibatalkan) diisi lebih dulu
  // supaya tautannya tidak lagi membuka form kosong.
  const invoice = Number.isInteger(requestedInvoiceId) && requestedInvoiceId > 0
    ? await prisma.salesInvoice.findUnique({
        where: { id: requestedInvoiceId },
        select: {
          id: true,
          documentNo: true,
          customerId: true,
          items: { select: { itemId: true, qty: true } },
        },
      })
    : null

  let prefill: ReturnPrefill | null = null

  if (invoice) {
    const priorReturns = await prisma.salesReturnItem.findMany({
      where: { salesReturn: { salesInvoiceId: invoice.id, status: { not: "cancelled" } } },
      select: { itemId: true, qty: true },
    })
    const returnedByItem = new Map<number, number>()
    for (const line of priorReturns) {
      returnedByItem.set(line.itemId, (returnedByItem.get(line.itemId) ?? 0) + Number(line.qty))
    }

    prefill = buildReturnPrefill({ invoice, returnedByItem })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Retur", href: "/penjualan/retur" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Retur Penjualan</h1>
      </div>
      {Number.isInteger(requestedInvoiceId) && requestedInvoiceId > 0 && !prefill && (
        <Alert>
          <AlertTitle>Pilihan awal tidak dipakai</AlertTitle>
          <AlertDescription>
            Faktur #{requestedInvoiceId} tidak ditemukan, belum berstatus diposting/terkirim, atau semua
            barisnya sudah pernah diretur habis. Pilih faktur dan barangnya langsung.
          </AlertDescription>
        </Alert>
      )}
      <SalesReturnForm
        invoices={invoices}
        customers={customers}
        items={items}
        // Form retur memakai prop `returnData` untuk men-seed nilai awal dan
        // memilih mode dari `id` (id bernilai → mode ubah). Jalur "buat dari
        // faktur" memakai seed yang sama tanpa dokumen tersimpan, jadi `id` diisi
        // 0 (falsy → mode buat baru) dan tanggalnya hari ini.
        returnData={
          prefill
            ? {
                id: 0,
                customerId: prefill.customerId,
                salesInvoiceId: prefill.salesInvoiceId,
                date: toLocalDateOnly(new Date()),
                items: prefill.items,
              }
            : undefined
        }
      />
    </div>
  )
}
