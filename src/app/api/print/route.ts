import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { auth } from "@/lib/auth/auth"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type") // invoice | quotation | order | work-order
  const idStr = searchParams.get("id")

  if (!type || !idStr) {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 })
  }

  const id = Number(idStr)
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 })
  }

  try {
    const [settings, companyName] = await Promise.all([
      getSystemSettings(),
      prisma.systemSetting.findFirst(),
    ])

    const companyInfo = {
      name: settings.companyName || "Yara ERP",
      address: settings.companyAddress || "",
      phone: settings.companyPhone || "",
      email: settings.companyEmail || "",
      website: settings.companyWebsite || "",
    }

    if (type === "invoice") {
      const doc = await prisma.salesInvoice.findUnique({
        where: { id },
        include: { customer: true, items: true },
      })
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

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
          tax: Number(doc.tax || 0),
          total: Number(doc.grandTotal),
        },
      })
    }

    if (type === "quotation") {
      const doc = await prisma.quotation.findUnique({
        where: { id },
        include: { customer: true, sections: { include: { items: true } } },
      })
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

      // Flatten items from all sections
      const allItems = doc.sections.flatMap(sec => sec.items)

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
          notes: doc.notes || "",
        },
        items: allItems.map((it, idx) => ({
          no: idx + 1,
          description: it.description || "Item Jasa/Barang",
          qty: Number(it.qty),
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
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

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
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

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

    return NextResponse.json({ error: "Unsupported type" }, { status: 400 })
  } catch (error) {
    console.error("Print API error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
