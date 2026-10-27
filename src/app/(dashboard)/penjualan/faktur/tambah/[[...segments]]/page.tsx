export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { SalesInvoiceForm } from "@/components/forms/sales-invoice-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert"
import {
  DELIVERABLE_ORDER_STATUSES,
  DELIVERABLE_ORDER_STATUS_LABELS,
} from "@/lib/validations/sales.schemas"
import { statusLabel } from "@/lib/utils/status-labels"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Faktur" }

const orderHref = (slug: string) => `/penjualan/faktur/tambah/pesanan/${slug}`
const quotationHref = (slug: string) => `/penjualan/faktur/tambah/penawaran/${slug}`

export default async function CreateSalesInvoicePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ salesOrderId?: string; quotationId?: string }>
}) {
  await requirePermission("create_sales_invoices")

  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["pesanan", "penawaran"])

  // Tautan lama `?salesOrderId=`/`?quotationId=` → bentuk path.
  if (!seg.pesanan && !seg.penawaran) {
    if (params.salesOrderId !== undefined) {
      await redirectLegacyPrefillQuery(prisma.salesOrder, params.salesOrderId, orderHref, "/penjualan/faktur/tambah")
    }
    if (params.quotationId !== undefined) {
      await redirectLegacyPrefillQuery(prisma.quotation, params.quotationId, quotationHref, "/penjualan/faktur/tambah")
    }
  }
  const wantedSalesOrderId = seg.pesanan
    ? await resolvePrefillId(prisma.salesOrder, seg.pesanan, orderHref)
    : undefined
  const wantedQuotationId = seg.penawaran
    ? await resolvePrefillId(prisma.quotation, seg.penawaran, quotationHref)
    : undefined

  // Satu daftar status untuk tombol di detail pesanan, daftar pemilih di
  // sini, dan penjagaan createSalesInvoice: DELIVERABLE_ORDER_STATUSES.
  // Sebelumnya halaman ini memuat [draft, confirmed] sementara tombol asal
  // menawarkan [approved, confirmed, processing, completed] — irisan
  // keduanya hampir kosong dan pemilih tampil yatim tanpa penjelasan.
  const [customers, salesOrders] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.salesOrder.findMany({
      where: { status: { in: [...DELIVERABLE_ORDER_STATUSES] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
  ])

  let defaultSalesOrderId: number | undefined
  let defaultCustomerId: number | undefined
  let defaultQuotationId: number | undefined
  let prefillNotice: string | null = null
  let quotationPrefill: {
    subtotal: unknown
    discount: unknown
    tax: unknown
    sections: Array<{
      items: Array<{
        itemId: number | null
        description: string | null
        qty: unknown
        unitPrice: unknown
        discount: unknown
      }>
    }>
  } | null = null

  // Tautan "buat dari" Perintah Kerja mengirim segmen penawaran/<slug> (perintah kerja
  // lahir dari penawaran). Faktur tertaut ke PESANAN PENJUALAN bila ada;
  // penawaran diterjemahkan ke pesanannya supaya prefill benar-benar terjadi.
  if (wantedSalesOrderId) {
    const so = await prisma.salesOrder.findUnique({
      where: { id: wantedSalesOrderId },
      select: { id: true, documentNo: true, status: true },
    })
    if (so && (DELIVERABLE_ORDER_STATUSES as readonly string[]).includes(so.status)) {
      defaultSalesOrderId = so.id
    } else {
      prefillNotice = so
        ? `Pesanan Penjualan ${so.documentNo} berstatus ${statusLabel(so.status)}; faktur hanya dibuat dari pesanan berstatus ${DELIVERABLE_ORDER_STATUS_LABELS}. Pilihan awal tidak dipakai.`
        : `Pesanan Penjualan #${wantedSalesOrderId} tidak ditemukan. Pilihan awal tidak dipakai.`
    }
  } else if (wantedQuotationId) {
    const so = await prisma.salesOrder.findFirst({
      where: { quotationId: wantedQuotationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true, customerId: true, status: true },
    })
    if (so && (DELIVERABLE_ORDER_STATUSES as readonly string[]).includes(so.status)) {
      defaultSalesOrderId = so.id
      defaultCustomerId = so.customerId
    } else if (so) {
      prefillNotice =
        `Penawaran ini sudah punya Pesanan Penjualan ${so.documentNo} berstatus ${statusLabel(so.status)}; ` +
        `faktur dibuat sesudah pesanan berstatus ${DELIVERABLE_ORDER_STATUS_LABELS}. Pilihan awal tidak dipakai.`
    } else {
      // Penawaran belum punya pesanan (mis. Perintah Kerja yang lahir
      // langsung dari penawaran): faktur dibuat dari penawaran itu sendiri —
      // pelanggan + barisnya di-prefill dan quotationId diteruskan ke form
      // supaya tautan penawarannya tidak hilang.
      const quotation = await prisma.quotation.findUnique({
        where: { id: wantedQuotationId },
        select: {
          id: true,
          documentNo: true,
          customerId: true,
          subtotal: true,
          discount: true,
          tax: true,
          sections: {
            orderBy: { id: "asc" },
            select: {
              items: {
                orderBy: { id: "asc" },
                select: { itemId: true, description: true, qty: true, unitPrice: true, discount: true },
              },
            },
          },
        },
      })
      if (quotation) {
        defaultQuotationId = quotation.id
        defaultCustomerId = quotation.customerId
        quotationPrefill = quotation
      } else {
        prefillNotice = `Penawaran #${wantedQuotationId} tidak ditemukan. Pilihan awal tidak dipakai.`
      }
    }
  }

  // Item pesanan/penawaran dibawa sebagai NILAI AWAL faktur. Sebelumnya
  // halaman ini hanya mengoper id + pelanggan, jadi faktur hasil konversi
  // lahir dengan tabel item kosong dan kasir harus mengetik ulang seluruh
  // baris. Nilainya tetap boleh diubah di form (fabrikasi: spesifikasi bisa
  // berubah).
  let initialItems: Array<{
    itemId: number | null
    description: string | null
    qty: number
    unitPrice: number
    discount: number
  }> = []
  let initialTaxRate = 0

  if (defaultSalesOrderId) {
    const order = await prisma.salesOrder.findUnique({
      where: { id: defaultSalesOrderId },
      select: {
        customerId: true,
        subtotal: true,
        discount: true,
        tax: true,
        items: {
          orderBy: { id: "asc" },
          select: { itemId: true, description: true, qty: true, unitPrice: true, discount: true },
        },
      },
    })
    if (order) {
      defaultCustomerId = defaultCustomerId ?? order.customerId
      initialItems = order.items.map((item) => ({
        itemId: item.itemId,
        description: item.description,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
      }))
      const dasarPengenaan = Number(order.subtotal) - Number(order.discount)
      initialTaxRate = dasarPengenaan > 0
        ? Math.round((Number(order.tax) / dasarPengenaan) * 100 * 100) / 100
        : 0
    }
  } else if (quotationPrefill) {
    initialItems = quotationPrefill.sections.flatMap((section) =>
      section.items.map((item) => ({
        itemId: item.itemId,
        description: item.description,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
      })),
    )
    const dasarPengenaan = Number(quotationPrefill.subtotal) - Number(quotationPrefill.discount)
    initialTaxRate = dasarPengenaan > 0
      ? Math.round((Number(quotationPrefill.tax) / dasarPengenaan) * 100 * 100) / 100
      : 0
  }

  // Daftar barang untuk editor item: tanpa ini baris hasil konversi tidak bisa
  // diganti ke barang lain dan baris baru tidak punya pilihan.
  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, price: true, isScrapSaleItem: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Faktur",href:"/penjualan/faktur"},{label:"Tambah"}]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Faktur</h1>
      </div>
      {prefillNotice && (
        <Alert>
          <AlertTitle>Pilihan awal tidak dipakai</AlertTitle>
          <AlertDescription>{prefillNotice}</AlertDescription>
        </Alert>
      )}
      <SalesInvoiceForm
        customers={customers}
        salesOrders={salesOrders}
        defaultSalesOrderId={defaultSalesOrderId}
        defaultCustomerId={defaultCustomerId}
        defaultQuotationId={defaultQuotationId}
        initialItems={initialItems}
        initialTaxRate={initialTaxRate}
        availableItems={items.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          price: Number(item.price),
          isScrapSaleItem: item.isScrapSaleItem,
        }))}
      />
    </div>
  )
}
