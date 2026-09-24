import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"
import { paymentMethodLabel, shippingMethodLabel } from "@/lib/utils/method-labels"
import { formatDate } from "@/lib/utils/format"

const PRINT_PERMISSION: Record<string, string> = {
  invoice: "view_sales_invoices",
  quotation: "view_quotations",
  order: "view_sales_orders",
  "work-order": "view_work_orders",
}

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

  const id = Number(idStr)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError("BAD_REQUEST", "ID tidak valid")
  }

  try {
    const settings = await getSystemSettings()

    const companyInfo = {
      name: settings.companyName || "Yara ERP",
      address: settings.companyAddress || "",
      phone: settings.companyPhone || "",
      email: settings.companyEmail || "",
      website: settings.companyWebsite || "",
      logo: settings.companyLogo || "",
    }

    if (type === "invoice") {
      const doc = await prisma.salesInvoice.findUnique({
        where: { id },
        include: { customer: true, items: true },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const itemIds = doc.items.map((it) => it.itemId).filter((id): id is number => id !== null && id > 0)
      const itemsMap = new Map<number, string>()
      if (itemIds.length > 0) {
        const dbItems = await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
        for (const di of dbItems) {
          itemsMap.set(di.id, di.name)
        }
      }

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "FAKTUR PENJUALAN / INVOICE",
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
          customer: true,
          customerVehicle: {
            include: {
              vehicle: {
                include: {
                  variant: { include: { model: { include: { brand: true } } } },
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

      const itemIds = allItems.map((it) => it.itemId).filter((id): id is number => id !== null && id > 0)
      const itemsMap = new Map<number, string>()
      if (itemIds.length > 0) {
        const dbItems = await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
        for (const di of dbItems) {
          itemsMap.set(di.id, di.name)
        }
      }

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PENAWARAN HARGA / QUOTATION",
          documentNo: doc.documentNo,
          date: formatDate(doc.date),
          dueDate: doc.validUntil ? formatDate(doc.validUntil) : null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          customerEmail: doc.customer.email || "-",
          vehicleName,
          plateNumber: doc.customerVehicle?.licensePlate || doc.customerVehicle?.vehicle?.plateNumber || "-",
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
        include: { customer: true, items: true },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      const itemIds = doc.items.map((it) => it.itemId).filter((id): id is number => id !== null && id > 0)
      const itemsMap = new Map<number, string>()
      if (itemIds.length > 0) {
        const dbItems = await prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
        for (const di of dbItems) {
          itemsMap.set(di.id, di.name)
        }
      }

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PESANAN PENJUALAN / SALES ORDER",
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
          customer: true,
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
          title: "PERINTAH KERJA / WORK ORDER",
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

    return apiError("BAD_REQUEST", "Tipe tidak didukung")
  } catch (error) {
    console.error("Print API error:", error)
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
