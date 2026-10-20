import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"
import { paymentMethodLabel, shippingMethodLabel } from "@/lib/utils/method-labels"
import { formatDate } from "@/lib/utils/format"
import { companyAddressLines } from "@/lib/utils/company-address"
import { canAccessWarehouseScopedDocument } from "@/lib/auth/document-scope"

const PRINT_PERMISSION: Record<string, string> = {
  invoice: "view_sales_invoices",
  quotation: "view_quotations",
  order: "view_sales_orders",
  "work-order": "view_work_orders",
  "purchase-order": "view_purchase_orders",
  "delivery-order": "view_delivery_orders",
  "down-payment": "view_down_payments",
  "sales-payment": "view_sales_payments",
  "vendor-payment": "view_vendor_payments",
  "sales-return": "view_sales_returns",
  "purchase-return": "view_purchase_returns",
  "goods-receipt": "view_goods_receipts",
  "purchase-request": "view_purchase_requests",
  "vendor-bill": "view_vendor_bills",
  expense: "view_expenses",
}

/**
 * Nama + satuan barang untuk sekumpulan itemId. Dipakai dokumen yang hanya
 * menyimpan `itemId` (tidak ada relasi Prisma ke Item), supaya tabel cetak
 * menampilkan nama barang, bukan "Item #12".
 */
async function loadItemInfo(ids: number[]): Promise<Map<number, { name: string; unit: string | null }>> {
  const info = new Map<number, { name: string; unit: string | null }>()
  const unique = [...new Set(ids.filter((value) => Number.isSafeInteger(value) && value > 0))]
  if (unique.length === 0) return info
  const rows = await prisma.item.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, unitOfMeasure: true },
  })
  for (const row of rows) info.set(row.id, { name: row.name, unit: row.unitOfMeasure })
  return info
}

/** Nama barang (id -> nama) untuk baris dokumen yang hanya menyimpan itemId. */
async function loadItemNames(ids: (number | null)[]): Promise<Map<number, string>> {
  const names = new Map<number, string>()
  const itemIds = ids.filter((id): id is number => id !== null && id > 0)
  if (itemIds.length > 0) {
    const dbItems = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true },
    })
    for (const di of dbItems) {
      names.set(di.id, di.name)
    }
  }
  return names
}

// Pihak dokumen hanya dirender name/address/street/phone di kop cetak
// (quotation tambah email). include customer:true memuat baris utuh -
// taxId/creditLimit pelanggan, rekening bank + NPWP vendor, createdBy dst -
// ke memori handler tanpa guna. Pola select sempit sama dengan
// paymentMethod/shippingMethod/withholdingType di berkas ini.
const PRINT_CUSTOMER_SELECT = { name: true, address: true, street: true, phone: true } as const
const PRINT_VENDOR_SELECT = { name: true, address: true, street: true, phone: true } as const

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("tipe") // invoice | quotation | order | work-order
  const idStr = searchParams.get("id")

  if (!type || !idStr) {
    return apiError("BAD_REQUEST", "Tipe atau ID tidak ditemukan")
  }

  // Permission check per document type (prevents IDOR — any user reading any doc by id).
  // Fail CLOSED on an unknown type: `requiredPerm` undefined used to skip the check
  // entirely, so a future document type added to the render switch below without a
  // matching entry here would be printable by any authenticated user.
  const requiredPerm = PRINT_PERMISSION[type]
  if (!requiredPerm) {
    return apiError("BAD_REQUEST", "Tipe tidak didukung")
  }
  if (!(await hasPermission(requiredPerm))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  // Tolak bentuk yang Number() terima diam-diam ("1e3", "0x10", "+5", " 5"):
  // pola notifications/[id] + workflow. Tes terpisah karena tes 9007199254740992
  // sesudah Number() gagal isSafeInteger, sedangkan bentuk ini lolos sebagai ID lain.
  if (!/^\d+$/.test(idStr)) {
    return apiError("BAD_REQUEST", "ID tidak valid")
  }
  const id = Number(idStr)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError("BAD_REQUEST", "ID tidak valid")
  }

  // Scope gudang: dokumen yang dibatasi gudang memakai penjagaan yang SAMA
  // dengan lampirannya (lib/auth/document-scope), karena mencetak adalah cara
  // data keluar sebagai berkas — tidak boleh lebih longgar dari halaman/lampiran.
  // Tipe di route ini memakai tanda hubung (`goods-receipt`); tabel scope
  // memakai snake_case, jadi dinormalkan dulu. Dokumen di luar tabel selalu lolos.
  const scopedType = type.replace(/-/g, "_")
  if (!(await canAccessWarehouseScopedDocument(scopedType, id, await auth()))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  try {
    const settings = await getSystemSettings()

    const companyInfo = {
      name: settings.companyName || "Yara ERP",
      // Jalan + wilayah (desa/kecamatan/kota/provinsi + kode pos) sebagai beberapa
      // baris, supaya kop PDF memuat alamat lengkap seperti di Pengaturan.
      address: companyAddressLines(settings).join("\n"),
      phone: settings.companyPhone || "",
      email: settings.companyEmail || "",
      website: settings.companyWebsite || "",
      logo: settings.companyLogo || "",
    }

    if (type === "invoice") {
      const doc = await prisma.salesInvoice.findUnique({
        where: { id },
        include: { customer: { select: PRINT_CUSTOMER_SELECT }, items: true },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const itemsMap = await loadItemNames(doc.items.map((it) => it.itemId))

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "FAKTUR PENJUALAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: doc.dueDate ? formatDate(doc.dueDate) : null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          notes: doc.notes ? doc.notes.replace("Auto-generated dari", "Otomatis dibuat dari") : "",
        },
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: it.description || itemsMap.get(it.itemId || 0) || "Item",
          qty: Number(it.qty),
          unit: it.uom ?? null,
          price: Number(it.unitPrice),
          discount: Number(it.discount || 0),
          total: Number(it.total),
        })),
        summary: {
          subtotal: Number(doc.subtotal),
          discount: Number(doc.discount || 0),
          tax: Number(doc.taxAmount || 0),
          total: Number(doc.grandTotal),
        },
      })
    }

    if (type === "quotation") {
      const doc = await prisma.quotation.findUnique({
        where: { id },
        include: {
          customer: { select: { ...PRINT_CUSTOMER_SELECT, email: true } },
          customerVehicle: {
            include: {
              vehicle: {
                include: {
                  variant: { include: { model: { include: { brand: { select: { name: true } } } } } },
                },
              },
            },
          },
          sections: {
            include: { items: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      // Flatten items from all sections for backward compatibility
      const allItems = doc.sections.flatMap((sec) => sec.items)
      const vehicleModel = doc.customerVehicle?.vehicle?.variant?.model
      const vehicleName = vehicleModel ? `${vehicleModel.brand?.name ?? ""} ${vehicleModel.name}`.trim() : ""

      // Resolve method names from master data (fallback to static labels for legacy codes)
      const [pmRow, smRow] = await Promise.all([
        doc.paymentMethod ? prisma.paymentMethod.findUnique({ where: { code: doc.paymentMethod }, select: { name: true } }) : null,
        doc.shippingMethod ? prisma.shippingMethod.findUnique({ where: { code: doc.shippingMethod }, select: { name: true } }) : null,
      ])
      const paymentMethodText = pmRow?.name ?? paymentMethodLabel(doc.paymentMethod)
      const shippingMethodText = smRow?.name ?? shippingMethodLabel(doc.shippingMethod)

      const itemsMap = await loadItemNames(allItems.map((it) => it.itemId))

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PENAWARAN HARGA",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: doc.validUntil ? formatDate(doc.validUntil) : null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          customerEmail: doc.customer.email || "-",
          vehicleName,
          plateNumber: doc.customerVehicle?.plateNumber || "-",
          paymentMethod: paymentMethodText,
          shippingMethod: shippingMethodText,
          footerNotes: settings.quotationFooterNotes || "",
          signatureName: settings.quotationSignatureName || "",
          signatureImage: settings.quotationSignatureImage || "",
          notes: doc.notes ? doc.notes.replace("Auto-generated dari", "Otomatis dibuat dari") : "",
        },
        sections: doc.sections.map((sec) => ({
          name: sec.name,
          items: sec.items.map((it, idx) => ({
            no: idx + 1,
            description: it.description || itemsMap.get(it.itemId || 0) || "Item Jasa/Barang",
            qty: Number(it.qty),
            unit: it.uom || "Set",
            price: Number(it.unitPrice),
            discount: Number(it.discount || 0),
            total: Number(it.total),
          })),
        })),
        items: allItems.map((it, idx) => ({
          no: idx + 1,
          description: it.description || itemsMap.get(it.itemId || 0) || "Item Jasa/Barang",
          qty: Number(it.qty),
          unit: it.uom || "Set",
          price: Number(it.unitPrice),
          discount: Number(it.discount || 0),
          total: Number(it.total),
        })),
        summary: {
          subtotal: Number(doc.subtotal),
          discount: Number(doc.discount),
          tax: Number(doc.tax),
          total: Number(doc.grandTotal),
        },
      })
    }

    if (type === "order") {
      const doc = await prisma.salesOrder.findUnique({
        where: { id },
        include: { customer: { select: PRINT_CUSTOMER_SELECT }, items: true },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const itemsMap = await loadItemNames(doc.items.map((it) => it.itemId))

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PESANAN PENJUALAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: doc.deliveryDate ? formatDate(doc.deliveryDate) : null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          notes: doc.notes ? doc.notes.replace("Auto-generated dari", "Otomatis dibuat dari") : "",
        },
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: it.description || itemsMap.get(it.itemId || 0) || "Item",
          qty: Number(it.qty),
          price: Number(it.unitPrice),
          discount: Number(it.discount || 0),
          total: Number(it.total),
        })),
        summary: {
          subtotal: Number(doc.subtotal),
          discount: Number(doc.discount || 0),
          tax: Number(doc.tax || 0),
          total: Number(doc.grandTotal),
        },
      })
    }

    if (type === "work-order") {
      const doc = await prisma.workOrder.findUnique({
        where: { id },
        include: {
          customer: { select: PRINT_CUSTOMER_SELECT },
          items: true,
          quotation: { select: { documentNo: true } },
          project: { select: { name: true } },
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      // Resolve item names from items table
      const itemIds = doc.items.map((it) => it.itemId).filter((id) => id > 0)
      const itemsMap = new Map<number, string>()
      if (itemIds.length > 0) {
        const dbItems = await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, sku: true },
        })
        for (const di of dbItems) {
          itemsMap.set(di.id, `[${di.sku}] ${di.name}`)
        }
      }

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PERINTAH KERJA",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          startDate: doc.startDate ? formatDate(doc.startDate) : null,
          endDate: doc.endDate ? formatDate(doc.endDate) : null,
          status: doc.status,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          quotationNo: doc.quotation?.documentNo || null,
          projectName: doc.project?.name || null,
          notes: doc.notes ? doc.notes.replace("Auto-generated dari", "Otomatis dibuat dari") : "",
        },
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: it.description || itemsMap.get(it.itemId) || `Item #${it.itemId}`,
          qty: Number(it.qty),
          status: it.status || "pending",
        })),
      })
    }

    if (type === "purchase-order") {
      const doc = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: { vendor: { select: PRINT_VENDOR_SELECT }, items: true },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const itemIds = doc.items.map((it) => it.itemId)
      const poItemsMap = new Map<number, { name: string; unit: string | null }>()
      if (itemIds.length > 0) {
        const dbItems = await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, unitOfMeasure: true },
        })
        for (const di of dbItems) poItemsMap.set(di.id, { name: di.name, unit: di.unitOfMeasure })
      }

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PESANAN PEMBELIAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          // Tanggal perkiraan terima dipakai sebagai baris "Jatuh Tempo".
          dueDate: doc.expectedDate ? formatDate(doc.expectedDate) : null,
          customerName: doc.vendor.name,
          customerAddress: doc.vendor.address || doc.vendor.street || "",
          customerPhone: doc.vendor.phone || "",
          notes: doc.notes || doc.description || "",
        },
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: poItemsMap.get(it.itemId)?.name || `Item #${it.itemId}`,
          qty: Number(it.qty),
          unit: poItemsMap.get(it.itemId)?.unit ?? null,
          price: Number(it.unitPrice),
          discount: Number(it.discount || 0),
          total: Number(it.total),
        })),
        summary: {
          subtotal: Number(doc.subtotal),
          discount: Number(doc.discount || 0),
          tax: Number(doc.tax || 0),
          total: Number(doc.grandTotal),
        },
      })
    }

    if (type === "delivery-order") {
      const doc = await prisma.deliveryOrder.findUnique({
        where: { id },
        include: {
          salesOrder: { include: { customer: { select: PRINT_CUSTOMER_SELECT } } },
          items: { include: { item: { select: { name: true, unitOfMeasure: true } } } },
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const customer = doc.salesOrder.customer

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "SURAT JALAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: doc.deliveryDate ? formatDate(doc.deliveryDate) : null,
          customerName: customer.name,
          customerAddress: doc.shippingAddress || customer.address || customer.street || "",
          customerPhone: customer.phone || "",
          notes: doc.notes || "",
        },
        // Surat jalan tanpa harga — barang diserahkan, bukan ditagihkan.
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: it.item.name,
          qty: Number(it.qty),
          unit: it.unit || it.item.unitOfMeasure || null,
          note: it.notes ?? null,
          price: 0,
          discount: 0,
          total: 0,
        })),
        summary: { subtotal: 0, discount: 0, tax: 0, total: 0 },
      })
    }

    if (type === "down-payment") {
      const doc = await prisma.downPayment.findUnique({ where: { id }, include: { customer: { select: PRINT_CUSTOMER_SELECT } } })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const amount = Number(doc.amount)
      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "KUITANSI UANG MUKA",
          documentNo: doc.documentNo,
          date: formatDate(doc.paymentDate),
          dueDate: null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          notes: doc.notes || "",
        },
        items: [
          {
            no: 1,
            description: `Uang muka pesanan${doc.paymentMethod ? ` (${doc.paymentMethod})` : ""}`,
            qty: 1,
            price: amount,
            discount: 0,
            total: amount,
          },
        ],
        summary: { subtotal: amount, discount: 0, tax: 0, total: amount },
      })
    }

    if (type === "sales-payment") {
      const doc = await prisma.salesPayment.findUnique({
        where: { id },
        // SalesPayment hanya menyimpan customerId — pelanggan diambil dari faktur.
        include: { salesInvoice: { include: { customer: { select: PRINT_CUSTOMER_SELECT } } } },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const amount = Number(doc.amount)
      const customer = doc.salesInvoice.customer
      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "KUITANSI PEMBAYARAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.paymentDate),
          dueDate: null,
          customerName: customer.name,
          customerAddress: customer.address || customer.street || "",
          customerPhone: customer.phone || "",
          notes: [doc.referenceNo ? `Referensi: ${doc.referenceNo}` : null, doc.notes]
            .filter(Boolean)
            .join(" — "),
        },
        items: [
          {
            no: 1,
            description: `Pelunasan faktur ${doc.salesInvoice.documentNo}`,
            qty: 1,
            price: amount,
            discount: 0,
            total: amount,
          },
        ],
        summary: {
          subtotal: amount,
          discount: 0,
          tax: 0,
          total: amount,
          // Faktur tetap berguna sebagai konteks nominal tagihan aslinya.
          invoiceTotal: Number(doc.salesInvoice.grandTotal),
        },
      })
    }

    if (type === "vendor-payment") {
      const doc = await prisma.vendorPayment.findUnique({
        where: { id },
        include: {
          vendor: { select: PRINT_VENDOR_SELECT },
          allocations: { include: { vendorBill: { select: { documentNo: true } } } },
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const amount = Number(doc.amount)
      // Bila pembayaran dialokasikan ke beberapa tagihan, rinciannya ditampilkan
      // per tagihan; tanpa alokasi cukup satu baris sebesar nilai pembayaran.
      const items = doc.allocations.length
        ? doc.allocations.map((allocation, idx) => ({
            no: idx + 1,
            description: `Pembayaran tagihan ${allocation.vendorBill.documentNo}`,
            qty: 1,
            price: Number(allocation.amount),
            discount: 0,
            total: Number(allocation.amount),
          }))
        : [
            {
              no: 1,
              description: `Pembayaran hutang usaha${doc.paymentMethod ? ` (${doc.paymentMethod})` : ""}`,
              qty: 1,
              price: amount,
              discount: 0,
              total: amount,
            },
          ]

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "BUKTI PEMBAYARAN VENDOR",
          documentNo: doc.documentNo,
          date: formatDate(doc.paymentDate),
          dueDate: null,
          customerName: doc.vendor.name,
          customerAddress: doc.vendor.address || doc.vendor.street || "",
          customerPhone: doc.vendor.phone || "",
          notes: doc.notes || "",
        },
        items,
        summary: { subtotal: amount, discount: 0, tax: 0, total: amount },
      })
    }

    if (type === "sales-return") {
      const doc = await prisma.salesReturn.findUnique({
        where: { id },
        include: {
          customer: { select: PRINT_CUSTOMER_SELECT },
          salesInvoice: { select: { documentNo: true } },
          items: true,
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const info = await loadItemInfo(doc.items.map((it) => it.itemId))
      const items = doc.items.map((it, idx) => ({
        no: idx + 1,
        description: info.get(it.itemId)?.name || `Item #${it.itemId}`,
        qty: Number(it.qty),
        unit: info.get(it.itemId)?.unit ?? null,
        price: Number(it.price),
        discount: 0,
        total: Number(it.qty) * Number(it.price),
      }))
      const total = items.reduce((sum, item) => sum + item.total, 0)

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "RETUR PENJUALAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          notes: [
            doc.salesInvoice?.documentNo ? `Retur atas faktur ${doc.salesInvoice.documentNo}` : null,
            doc.reason,
          ]
            .filter(Boolean)
            .join(" — "),
        },
        items,
        summary: { subtotal: total, discount: 0, tax: 0, total },
      })
    }

    if (type === "purchase-return") {
      const doc = await prisma.purchaseReturn.findUnique({
        where: { id },
        include: {
          purchaseOrder: { include: { vendor: { select: PRINT_VENDOR_SELECT } } },
          items: true,
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const info = await loadItemInfo(doc.items.map((it) => it.itemId))
      const items = doc.items.map((it, idx) => ({
        no: idx + 1,
        description: info.get(it.itemId)?.name || `Item #${it.itemId}`,
        qty: Number(it.qty),
        unit: info.get(it.itemId)?.unit ?? null,
        price: Number(it.cost),
        discount: 0,
        total: Number(it.qty) * Number(it.cost),
      }))
      const total = items.reduce((sum, item) => sum + item.total, 0)
      const vendor = doc.purchaseOrder.vendor

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "RETUR PEMBELIAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: null,
          customerName: vendor.name,
          customerAddress: vendor.address || vendor.street || "",
          customerPhone: vendor.phone || "",
          notes: doc.reason || `Retur atas pesanan ${doc.purchaseOrder.documentNo}`,
        },
        items,
        summary: { subtotal: total, discount: 0, tax: 0, total },
      })
    }

    if (type === "goods-receipt") {
      const doc = await prisma.goodsReceipt.findUnique({
        where: { id },
        include: {
          purchaseOrder: { include: { vendor: { select: PRINT_VENDOR_SELECT } } },
          warehouse: { select: { name: true } },
          items: true,
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const info = await loadItemInfo(doc.items.map((it) => it.itemId))
      const items = doc.items.map((it, idx) => ({
        no: idx + 1,
        description: info.get(it.itemId)?.name || `Item #${it.itemId}`,
        qty: Number(it.qty),
        unit: info.get(it.itemId)?.unit ?? null,
        price: Number(it.unitCost),
        discount: 0,
        total: Number(it.qty) * Number(it.unitCost),
      }))
      const total = items.reduce((sum, item) => sum + item.total, 0)
      const vendor = doc.purchaseOrder.vendor

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PENERIMAAN BARANG",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: null,
          customerName: vendor.name,
          customerAddress: vendor.address || vendor.street || "",
          customerPhone: vendor.phone || "",
          notes: [
            doc.purchaseOrder.documentNo ? `Pesanan ${doc.purchaseOrder.documentNo}` : null,
            doc.warehouse?.name ? `Gudang: ${doc.warehouse.name}` : null,
            doc.notes,
          ]
            .filter(Boolean)
            .join(" — "),
        },
        items,
        summary: { subtotal: total, discount: 0, tax: 0, total },
      })
    }

    if (type === "purchase-request") {
      const doc = await prisma.purchaseRequest.findUnique({
        where: { id },
        include: { vendor: { select: PRINT_VENDOR_SELECT }, items: true },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const info = await loadItemInfo(doc.items.map((it) => it.itemId))

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PERMINTAAN PEMBELIAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.requestDate || doc.date),
          dueDate: null,
          customerName: doc.vendor?.name || "Belum ditentukan",
          customerAddress: doc.vendor?.address || doc.vendor?.street || "",
          customerPhone: doc.vendor?.phone || "",
          notes: doc.notes || doc.title || "",
        },
        // Permintaan belum berisi harga — hanya daftar kebutuhan.
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: info.get(it.itemId)?.name || `Item #${it.itemId}`,
          qty: Number(it.qty),
          unit: info.get(it.itemId)?.unit ?? null,
          note: it.notes ?? null,
          price: 0,
          discount: 0,
          total: 0,
        })),
        summary: { subtotal: 0, discount: 0, tax: 0, total: 0 },
      })
    }

    if (type === "vendor-bill") {
      const doc = await prisma.vendorBill.findUnique({
        where: { id },
        include: { vendor: { select: PRINT_VENDOR_SELECT }, items: true, withholdingType: { select: { name: true, rate: true } } },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const info = await loadItemInfo(doc.items.map((it) => it.itemId ?? 0))
      const items = doc.items.map((it, idx) => ({
        no: idx + 1,
        description: it.description || info.get(it.itemId ?? 0)?.name || `Item #${it.itemId}`,
        qty: Number(it.qty),
        unit: info.get(it.itemId ?? 0)?.unit ?? null,
        price: Number(it.unitPrice),
        discount: Number(it.discountPercent),
        // Tagihan vendor menyimpan persen per baris (discount_percent), jadi
        // kolom Potongan memang harus dicetak sebagai persen.
        discountIsPercent: true,
        total: Number(it.total),
      }))

      const withholding = Number(doc.withholdingAmount ?? 0)

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "TAGIHAN VENDOR",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: doc.dueDate ? formatDate(doc.dueDate) : null,
          customerName: doc.vendor.name,
          customerAddress: doc.vendor.address || doc.vendor.street || "",
          customerPhone: doc.vendor.phone || "",
          notes: [
            doc.vendorInvoiceNumber ? `No. faktur vendor: ${doc.vendorInvoiceNumber}` : null,
            doc.withholdingType
              ? `PPh ${doc.withholdingType.name} ${Number(doc.withholdingType.rate)}%: Rp ${withholding.toLocaleString("id-ID")}`
              : null,
            doc.notes,
          ]
            .filter(Boolean)
            .join(" — "),
        },
        items,
        summary: {
          subtotal: Number(doc.subtotal),
          discount: Number(doc.discountAmount || 0),
          tax: Number(doc.tax || 0),
          // Yang dibayarkan ke vendor adalah total dikurangi PPh dipotong.
          total: Number(doc.grandTotal) - withholding,
        },
      })
    }

    if (type === "expense") {
      const doc = await prisma.expense.findUnique({
        where: { id },
        include: { vendor: { select: PRINT_VENDOR_SELECT }, category: { select: { label: true } } },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const amount = Number(doc.amount)
      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "BUKTI PENGELUARAN",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: null,
          customerName: doc.vendor?.name || "Biaya internal",
          customerAddress: doc.vendor?.address || doc.vendor?.street || "",
          customerPhone: doc.vendor?.phone || "",
          notes: [
            doc.category?.label ? `Kategori: ${doc.category.label}` : null,
            doc.referenceNo ? `Referensi: ${doc.referenceNo}` : null,
            doc.description,
          ]
            .filter(Boolean)
            .join(" — "),
        },
        // Bukti pengeluaran = satu nominal; rinciannya di kolom keterangan.
        items: [
          {
            no: 1,
            description: doc.description || doc.category?.label || "Pengeluaran",
            qty: 1,
            price: amount,
            discount: 0,
            total: amount,
          },
        ],
        summary: { subtotal: amount, discount: 0, tax: 0, total: amount },
      })
    }

    return apiError("BAD_REQUEST", "Tipe tidak didukung")
  } catch (error) {
    console.error("Print API error:", error)
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
