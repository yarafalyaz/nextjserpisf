import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { revalidatePath } from "next/cache"

const MODULE_MAP: Record<string, { model: string; revalidate: string; permission: string }> = {
  "penjualan/penawaran": { model: "quotation", revalidate: "/sales/quotations", permission: "approve_quotations" },
  "penjualan/pesanan": { model: "salesOrder", revalidate: "/sales/orders", permission: "approve_sales_orders" },
  "penjualan/faktur": { model: "salesInvoice", revalidate: "/sales/invoices", permission: "approve_sales_invoices" },
  "pembelian/permintaan": { model: "purchaseRequest", revalidate: "/purchase/requests", permission: "approve_purchase_requests" },
  "pembelian/pesanan": { model: "purchaseOrder", revalidate: "/purchase/orders", permission: "approve_purchase_orders" },
  "pembelian/tagihan": { model: "vendorBill", revalidate: "/purchase/bills", permission: "approve_vendor_bills" },
  "sdm/cuti": { model: "leaveRequest", revalidate: "/hrm/leave", permission: "approve_leave_requests" },
  "sdm/lembur": { model: "overtimeRequest", revalidate: "/hrm/overtime", permission: "approve_overtime_requests" },
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Auth check — reject unauthenticated requests
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { path } = await params
  // path = ["sales", "quotations", "123", "approve"]
  if (!Array.isArray(path) || path.length < 3) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  const action = path[path.length - 1] // "approve" or "reject"
  const idRaw = path[path.length - 2]
  const id = Number.parseInt(idRaw, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  const moduleKey = path.slice(0, path.length - 2).join("/")

  const config = MODULE_MAP[moduleKey]
  if (!config) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 })
  }

  // Permission check — super_admin bypasses
  const userRoles = session.user.roles as string[] | undefined
  const userPermissions = session.user.permissions as string[] | undefined
  if (!userRoles?.includes("super_admin") && !userPermissions?.includes(config.permission)) {
    return NextResponse.json({ error: "Forbidden: Anda tidak memiliki izin untuk aksi ini" }, { status: 403 })
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  const newStatus = action === "approve" ? "approved" : "rejected"

  try {
    await (prisma as any)[config.model].update({
      where: { id },
      data: { status: newStatus },
    })

    revalidatePath(config.revalidate)
    return NextResponse.json({ success: true, status: newStatus })
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
  }
}
