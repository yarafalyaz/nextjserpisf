export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { DeliveryOrderForm } from "@/components/forms/delivery-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert"
import { DELIVERABLE_ORDER_STATUSES, DELIVERABLE_ORDER_STATUS_LABELS } from "@/lib/validations/sales.schemas"
import { buildDeliveryOrderLines, VOID_DELIVERY_ORDER_STATUSES } from "../_lib/order-lines"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Surat Jalan" }

export default async function CreateDeliveryOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ salesOrderId?: string; fakturPenjualanId?: string }>
}) {
  await requirePermission("create_delivery_orders")

  const params = await searchParams
  const requestedSalesOrderId = Number(params.salesOrderId)
  const requestedInvoiceId = Number(params.fakturPenjualanId)

  const salesOrders = await prisma.salesOrder.findMany({
    where: {
      deletedAt: null,
      status: { in: [...DELIVERABLE_ORDER_STATUSES] },
    },
    include: { customer: true, items: { orderBy: { id: "asc" } } },
    orderBy: { createdAt: "desc" },
  })

  // Baris yang sudah masuk surat jalan (kecuali yang dibatalkan) mengurangi sisa
  // yang boleh dikirim lagi — supaya operator tidak membuat surat jalan kedua
  // untuk barang yang sama.
  const lineIds = salesOrders.flatMap((so) => so.items.map((item) => item.id))
  const shipped = lineIds.length
    ? await prisma.deliveryOrderItem.findMany({
        where: {
          salesOrderItemId: { in: lineIds },
          deliveryOrder: { status: { notIn: [...VOID_DELIVERY_ORDER_STATUSES] } },
        },
        select: { salesOrderItemId: true, qty: true },
      })
    : []
  const shippedByLine = new Map<number, number>()
  for (const row of shipped) {
    if (row.salesOrderItemId === null) continue
    shippedByLine.set(row.salesOrderItemId, (shippedByLine.get(row.salesOrderItemId) ?? 0) + Number(row.qty))
  }

  const itemIds = [
    ...new Set(
      salesOrders
        .flatMap((so) => so.items.map((item) => item.itemId))
        .filter((id): id is number => id !== null),
    ),
  ]
  const itemRows = itemIds.length
    ? await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } })
    : []
  const itemNameById = new Map(itemRows.map((item) => [item.id, item.name]))

  const formData = salesOrders.map((so) => ({
    id: so.id,
    documentNo: so.documentNo,
    customer: { name: so.customer.name },
    lines: buildDeliveryOrderLines({ items: so.items, shippedByLine, itemNameById }),
  }))

  // Jalur "buat dari": `?salesOrderId=` dari detail pesanan dan
  // `?fakturPenjualanId=` dari tombol "+ Surat Jalan" di detail faktur. Parameternya
  // dibaca di sini supaya tautannya tidak lagi membuka form kosong.
  let defaultSalesOrderId: number | undefined
  let prefillNotice: string | null = null

  const invoice = Number.isInteger(requestedInvoiceId) && requestedInvoiceId > 0
    ? await prisma.salesInvoice.findUnique({
        where: { id: requestedInvoiceId },
        select: { id: true, documentNo: true, salesOrderId: true },
      })
    : null

  if (Number.isInteger(requestedInvoiceId) && requestedInvoiceId > 0) {
    if (!invoice) {
      prefillNotice = `Faktur #${requestedInvoiceId} tidak ditemukan, jadi surat jalan dibuat tanpa pilihan awal.`
    } else if (!invoice.salesOrderId) {
      prefillNotice = `Faktur ${invoice.documentNo} tidak punya Pesanan Penjualan, jadi tidak ada baris pesanan yang bisa disalin. Pilih pesanan penjualan langsung.`
    }
  }

  const wantedSalesOrderId = Number.isInteger(requestedSalesOrderId) && requestedSalesOrderId > 0
    ? requestedSalesOrderId
    : invoice?.salesOrderId ?? undefined

  if (wantedSalesOrderId !== undefined) {
    const found = formData.find((so) => so.id === wantedSalesOrderId)
    if (found) {
      defaultSalesOrderId = found.id
    } else if (!prefillNotice) {
      prefillNotice =
        `Pesanan Penjualan #${wantedSalesOrderId} tidak berstatus ${DELIVERABLE_ORDER_STATUS_LABELS} atau sudah tidak ada, ` +
        `jadi surat jalan dibuat tanpa pilihan awal.`
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Surat Jalan",href:"/penjualan/surat-jalan"},{label:"Tambah"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Surat Jalan</h1>
      </div>
      {prefillNotice && (
        <Alert>
          <AlertTitle>Pilihan awal tidak dipakai</AlertTitle>
          <AlertDescription>{prefillNotice}</AlertDescription>
        </Alert>
      )}
      {formData.length === 0 && (
        // Tanpa ini halaman hanya menampilkan pemilih pesanan yang kosong — buntu senyap.
        <Alert>
          <AlertTitle>Belum ada pesanan penjualan yang bisa dikirim</AlertTitle>
          <AlertDescription>
            Surat jalan hanya bisa dibuat dari Pesanan Penjualan berstatus{" "}
            <strong>Disetujui</strong>, <strong>Dikonfirmasi</strong>, <strong>Diproses</strong>, atau{" "}
            <strong>Selesai</strong>. Pesanan yang baru dibuat selalu berstatus konsep — setujui dulu lewat tombol{} 
            <strong>Setujui</strong> di halaman detail pesanan.
          </AlertDescription>
        </Alert>
      )}
      <DeliveryOrderForm salesOrders={formData} defaultSalesOrderId={defaultSalesOrderId} />
    </div>
  )
}
