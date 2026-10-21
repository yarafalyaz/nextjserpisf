export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VendorBillForm } from "@/components/forms/vendor-bill-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert"
import { GoodsReceiptLinkFields } from "../../_components/gr-link-fields"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Tagihan" }

const poHref = (slug: string) => `/pembelian/tagihan/tambah/po/${slug}`
const grHref = (slug: string) => `/pembelian/tagihan/tambah/penerimaan/${slug}`

export default async function CreateVendorBillPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ poId?: string; grId?: string }>
}) {
  await requirePermission("create_vendor_bills")

  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["po", "penerimaan"])

  // Tautan lama `?poId=`/`?grId=` → bentuk path (penerimaan didahulukan,
  // sama seperti prioritas prefill di bawah).
  if (!seg.po && !seg.penerimaan) {
    if (params.grId !== undefined) {
      await redirectLegacyPrefillQuery(prisma.goodsReceipt, params.grId, grHref, "/pembelian/tagihan/tambah")
    }
    if (params.poId !== undefined) {
      await redirectLegacyPrefillQuery(prisma.purchaseOrder, params.poId, poHref, "/pembelian/tagihan/tambah")
    }
  }

  const preselectedPoId = seg.po
    ? await resolvePrefillId(prisma.purchaseOrder, seg.po, poHref)
    : null
  const preselectedGrId = seg.penerimaan
    ? await resolvePrefillId(prisma.goodsReceipt, seg.penerimaan, grHref)
    : null

  const [vendors, items, purchaseOrders, withholdingTypes, projects] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, cost: true, unitOfMeasure: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { notIn: ["cancelled"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentNo: true,
        vendorId: true,
        isService: true,
        grandTotal: true,
      },
    }),
    prisma.withholdingTaxType.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, name: true, rate: true },
    }),
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, documentNo: true },
    }),
  ])

  // "Buat Tagihan dari Penerimaan": baris tagihan di-prefill dari baris
  // penerimaan (qty & biaya satuan apa adanya) dan penerimaannya dikirim lewat
  // `goodsReceiptId` supaya VendorBill.goodsReceiptId +
  // VendorBillItem.goodsReceiptItemId terisi — tanpa itu laporan Diterima Belum
  // Ditagih menghitung 0 untuk penerimaan ini.
  //
  // Hanya penerimaan yang sudah diverifikasi/selesai yang bisa ditagih (draft
  // belum menambah stok maupun membersihkan akun clearing; createVendorBill
  // menolaknya juga, jadi tombolnya pun tidak menawarkan GR draft).
  const goodsReceipt = preselectedGrId
    ? await prisma.goodsReceipt.findUnique({
        where: { id: preselectedGrId },
        select: {
          id: true,
          status: true,
          purchaseOrderId: true,
          purchaseOrder: { select: { vendorId: true } },
          items: {
            orderBy: { id: "asc" },
            select: { itemId: true, qty: true, unitCost: true },
          },
        },
      })
    : null

  const billableGr =
    goodsReceipt && ["verified", "completed"].includes(goodsReceipt.status)
      ? goodsReceipt
      : null

  // Penerimaan yang dituju tautan "Buat Tagihan" tapi belum/tidak bisa
  // ditagih (konsep, dibatalkan): jelaskan, jangan buka form polos diam-diam
  // yang tersimpan tanpa tautan penerimaan.
  const grNotice =
    preselectedGrId && !billableGr
      ? goodsReceipt
        ? `Penerimaan barang ini berstatus ${goodsReceipt.status}; tagihan hanya dibuat dari penerimaan terverifikasi/selesai. Pilihan awal tidak dipakai dan tagihan tidak akan tertaut ke penerimaan ini.`
        : `Penerimaan barang #${preselectedGrId} tidak ditemukan. Pilihan awal tidak dipakai.`
      : null

  // Pre-fill provider + PO when arriving from a PO's "Buat Tagihan" shortcut.
  // Baris PO ikut ditarik (dulu items: [] sehingga pengguna mengetik ulang
  // semuanya), dan PO yang belum bisa ditagih dijelaskan di awal, bukan
  // ditolak createVendorBill sesudah form terisi: PO barang butuh GR
  // terverifikasi (3-way match), PO jasa tidak.
  const preselectedPo = preselectedPoId
    ? await prisma.purchaseOrder.findUnique({
        where: { id: preselectedPoId },
        select: {
          id: true,
          documentNo: true,
          vendorId: true,
          isService: true,
          status: true,
          items: {
            orderBy: { id: "asc" },
            select: { itemId: true, qty: true, unitPrice: true },
          },
        },
      })
    : null

  let prefillNotice: string | null = null
  let billablePo: typeof preselectedPo = null
  if (preselectedPoId) {
    if (!preselectedPo) {
      prefillNotice = `Pesanan Pembelian #${preselectedPoId} tidak ditemukan. Pilihan awal tidak dipakai.`
    } else if (preselectedPo.isService) {
      if (["draft", "cancelled", "rejected"].includes(preselectedPo.status)) {
        prefillNotice = `Pesanan Pembelian ${preselectedPo.documentNo} berstatus ${preselectedPo.status}; tagihan jasa dibuat dari PO yang sudah disetujui/dipesan. Pilihan awal tidak dipakai.`
      } else {
        billablePo = preselectedPo
      }
    } else {
      const verifiedGr = await prisma.goodsReceipt.findFirst({
        where: { purchaseOrderId: preselectedPo.id, status: { in: ["verified", "completed"] } },
        select: { id: true },
      })
      if (verifiedGr) {
        billablePo = preselectedPo
      } else {
        prefillNotice =
          `Pesanan Pembelian ${preselectedPo.documentNo} belum punya penerimaan barang terverifikasi. ` +
          `Tagihan dari PO barang hanya dibuat sesudah barang diterima (3-way match). Pilihan awal tidak dipakai.`
      }
    }
  }

  const billPrefill = billableGr
    ? {
        id: 0,
        vendorId: billableGr.purchaseOrder.vendorId,
        purchaseOrderId: billableGr.purchaseOrderId,
        date: "",
        items: billableGr.items
          .filter((line) => Number(line.qty) > 0)
          .map((line) => ({
            itemId: line.itemId,
            qty: Number(line.qty),
            unitPrice: Number(line.unitCost),
            discountPercent: 0,
            taxPercent: 0,
          })),
      }
    : billablePo
      ? {
          id: 0,
          vendorId: billablePo.vendorId,
          purchaseOrderId: billablePo.id,
          date: "",
          items: billablePo.items
            .filter((line) => Number(line.qty) > 0)
            .map((line) => ({
              itemId: line.itemId,
              qty: Number(line.qty),
              unitPrice: Number(line.unitPrice),
              discountPercent: 0,
              taxPercent: 0,
            })),
        }
      : undefined

  const form = (
    <VendorBillForm
      vendors={vendors}
      items={JSON.parse(JSON.stringify(items))}
      purchaseOrders={purchaseOrders.map((po) => ({
        id: po.id,
        documentNo: po.documentNo,
        vendorId: po.vendorId,
        isService: po.isService,
        grandTotal: Number(po.grandTotal),
      }))}
      withholdingTypes={withholdingTypes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
      projects={projects}
      bill={billPrefill}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{ label: "Tagihan Pemasok", href: "/pembelian/tagihan" },{label:"Tambah"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Tagihan Pemasok</h1>
      </div>
      {prefillNotice && (
        <Alert>
          <AlertTitle>Pilihan awal tidak dipakai</AlertTitle>
          <AlertDescription>{prefillNotice}</AlertDescription>
        </Alert>
      )}
      {grNotice && (
        <Alert>
          <AlertTitle>Pilihan awal tidak dipakai</AlertTitle>
          <AlertDescription>{grNotice}</AlertDescription>
        </Alert>
      )}
      {billableGr ? (
        <GoodsReceiptLinkFields goodsReceiptId={billableGr.id}>{form}</GoodsReceiptLinkFields>
      ) : (
        form
      )}
    </div>
  )
}
