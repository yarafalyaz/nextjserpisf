export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { SalesReturnForm } from "@/components/forms/sales-return-form"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReturnPrefill, type ReturnPrefill } from "../../_lib/return-prefill"
import { RETURNABLE_INVOICE_STATUSES } from "@/lib/validations/sales.schemas"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Retur" }

const invoiceHref = (slug: string) => `/penjualan/retur/tambah/faktur/${slug}`

export default async function CreateSalesReturnPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ invoiceId?: string }>
}) {
  await requirePermission("create_sales_returns")

  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["faktur"])

  // Tautan lama `?invoiceId=` → bentuk path `faktur/<slug>`, sama seperti
  // halaman pembayaran.
  if (!seg.faktur && params.invoiceId !== undefined) {
    await redirectLegacyPrefillQuery(prisma.salesInvoice, params.invoiceId, invoiceHref, "/penjualan/retur/tambah")
  }
  const requestedInvoiceId = seg.faktur
    ? await resolvePrefillId(prisma.salesInvoice, seg.faktur, invoiceHref)
    : Number.NaN

  const [invoices, customers, items] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: [...RETURNABLE_INVOICE_STATUSES] } },
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

  // Jalur "buat dari" faktur: segmen `faktur/<slug>` dari halaman detail faktur. Faktur,
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
          status: true,
          items: { select: { itemId: true, qty: true } },
        },
      })
    : null

  let prefill: ReturnPrefill | null = null

  // Faktur di luar daftar retur (konsep/batal) tidak di-prefill walau
  // barisnya ada — daftar di atas, gerbang ini, dan createSalesReturn
  // membaca RETURNABLE_INVOICE_STATUSES yang sama.
  if (invoice && (RETURNABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
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
            Faktur #{requestedInvoiceId} tidak ditemukan, belum diposting (konsep/batal tidak bisa
            diretur), atau semua barisnya sudah pernah diretur habis. Pilih faktur dan barangnya langsung.
          </AlertDescription>
        </Alert>
      )}
      <SalesReturnForm
        invoices={invoices.map((inv) => ({ ...inv, documentNo: salesInvoiceLabel(inv) }))}
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
