import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { auth } from "@/lib/auth/auth"
import { hasPermission } from "@/lib/auth/permissions"
import { apiError } from "@/lib/api-response"
import { paymentMethodLabel, shippingMethodLabel } from "@/lib/utils/method-labels"

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

  // Permission check per document type (prevents IDOR — any user reading any doc by id)
  const requiredPerm = PRINT_PERMISSION[type]
  if (requiredPerm && !(await hasPermission(requiredPerm))) {
    return apiError("FORBIDDEN", "Akses ditolak")
  }

  const id = Number(idStr)
  if (isNaN(id)) {
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

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "FAKTUR PENJUALAN / INVOICE",
          documentNo: doc.documentNo,
          date: doc.date.toISOString().split("T")[0],
          dueDate: doc.dueDate?.toISOString().split("T")[0] || null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          notes: doc.notes || "",
        },
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: it.description || "Item",
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
          sections: { include: { items: true } },
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      // Flatten items from all sections
      const allItems = doc.sections.flatMap(sec => sec.items)
      const vehicleModel = doc.customerVehicle?.vehicle?.variant?.model
      const vehicleName = vehicleModel ? `${vehicleModel.brand?.name ?? ""} ${vehicleModel.name}`.trim() : ""

      // Resolve method names from master data (fallback to static labels for legacy codes)
      const [pmRow, smRow] = await Promise.all([
        doc.paymentMethod ? prisma.paymentMethod.findUnique({ where: { code: doc.paymentMethod }, select: { name: true } }) : null,
        doc.shippingMethod ? prisma.shippingMethod.findUnique({ where: { code: doc.shippingMethod }, select: { name: true } }) : null,
      ])
      const paymentMethodText = pmRow?.name ?? paymentMethodLabel(doc.paymentMethod)
      const shippingMethodText = smRow?.name ?? shippingMethodLabel(doc.shippingMethod)

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PENAWARAN HARGA / QUOTATION",
          documentNo: doc.documentNo,
          date: doc.date.toISOString().split("T")[0],
          dueDate: doc.validUntil?.toISOString().split("T")[0] || null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          vehicleName,
          plateNumber: doc.customerVehicle?.licensePlate || doc.customerVehicle?.vehicle?.plateNumber || "-",
          paymentMethod: paymentMethodText,
          shippingMethod: shippingMethodText,
          footerNotes: settings.quotationFooterNotes || "",
          signatureName: settings.quotationSignatureName || "",
          signatureImage: settings.quotationSignatureImage || "",
          notes: doc.notes || "",
        },
        items: allItems.map((it, idx) => ({
          no: idx + 1,
          description: it.description || "Item Jasa/Barang",
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

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PESANAN PENJUALAN / SALES ORDER",
          documentNo: doc.documentNo,
          date: doc.date.toISOString().split("T")[0],
          dueDate: doc.deliveryDate?.toISOString().split("T")[0] || null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          notes: doc.notes || "",
        },
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: it.description || "Item",
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
        },
      })
      if (!doc) return apiError("NOT_FOUND", "Dokumen tidak ditemukan")

      return NextResponse.json({
        company: companyInfo,
        docInfo: {
          title: "PERINTAH KERJA / WORK ORDER",
          documentNo: doc.documentNo,
          date: doc.date.toISOString().split("T")[0],
          dueDate: doc.endDate?.toISOString().split("T")[0] || null,
          customerName: doc.customer.name,
          customerAddress: doc.customer.address || doc.customer.street || "",
          customerPhone: doc.customer.phone || "",
          notes: doc.notes || "",
        },
        items: doc.items.map((it, idx) => ({
          no: idx + 1,
          description: it.description || `Material / Servis #${it.itemId}`,
          qty: Number(it.qty),
          price: Number(it.cost || 0),
          discount: 0,
          total: Number(it.qty) * Number(it.cost || 0),
        })),
        summary: {
          subtotal: doc.items.reduce((sum, it) => sum + (Number(it.qty) * Number(it.cost || 0)), 0),
          discount: 0,
          tax: 0,
          total: doc.items.reduce((sum, it) => sum + (Number(it.qty) * Number(it.cost || 0)), 0),
        },
      })
    }

    return apiError("BAD_REQUEST", "Tipe tidak didukung")
  } catch (error) {
    console.error("Print API error:", error)
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan server")
  }
}
