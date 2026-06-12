/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { revalidatePath } from "next/cache"
import { Status } from "@/lib/constants"
import { apiError } from "@/lib/api-response"

const MODULE_MAP: Record<string, { model: string; revalidate: string; permission: string }> = {
  "penjualan/penawaran": { model: "quotation", revalidate: "/penjualan/penawaran", permission: "approve_quotations" },
  "penjualan/pesanan": { model: "salesOrder", revalidate: "/penjualan/pesanan", permission: "approve_sales_orders" },
  "penjualan/faktur": { model: "salesInvoice", revalidate: "/penjualan/faktur", permission: "approve_sales_invoices" },
  "pembelian/permintaan": { model: "purchaseRequest", revalidate: "/pembelian/permintaan", permission: "approve_purchase_requests" },
  "pembelian/pesanan": { model: "purchaseOrder", revalidate: "/pembelian/pesanan", permission: "approve_purchase_orders" },
  "pembelian/tagihan": { model: "vendorBill", revalidate: "/pembelian/tagihan", permission: "approve_vendor_bills" },
  "sdm/cuti": { model: "leaveRequest", revalidate: "/sdm/cuti", permission: "approve_leave_requests" },
  "sdm/lembur": { model: "overtimeRequest", revalidate: "/sdm/lembur", permission: "approve_overtime_requests" },
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Auth check — reject unauthenticated requests
  const session = await auth()
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  const { path } = await params
  // path = ["sales", "quotations", "123", "approve"]
  if (!Array.isArray(path) || path.length < 3) {
    return apiError("BAD_REQUEST", "Path tidak valid")
  }

  const action = path[path.length - 1] // "approve" or "reject"
  const idRaw = path[path.length - 2]
  const id = Number.parseInt(idRaw, 10)
  if (!Number.isInteger(id) || id <= 0) {
    return apiError("BAD_REQUEST", "ID tidak valid")
  }

  const moduleKey = path.slice(0, path.length - 2).join("/")

  const config = MODULE_MAP[moduleKey]
  if (!config) {
    return apiError("NOT_FOUND", "Modul tidak ditemukan")
  }

  // Permission check — super_admin bypasses
  const userRoles = session.user.roles as string[] | undefined
  const userPermissions = session.user.permissions as string[] | undefined
  if (!userRoles?.includes("super_admin") && !userPermissions?.includes(config.permission)) {
    return apiError("FORBIDDEN", "Anda tidak memiliki izin untuk aksi ini")
  }

  if (action !== "approve" && action !== "reject") {
    return apiError("BAD_REQUEST", "Aksi tidak valid")
  }

  const newStatus = action === "approve" ? Status.APPROVED : Status.REJECTED

  try {
    // Fix C2: state-transition guard — only allow transitions from pending/draft
    // (or "sent" for sales). Use updateMany to detect concurrent updates — if
    // count === 0 the row was already moved by another approver (race) and we
    // return 409 Conflict. Prevents re-approval of finalized records and
    // resurrecting rejected items.
    const allowedFrom = ["pending", "draft", "sent"]
    const delegate = prisma[config.model as keyof typeof prisma] as any
    const result = await delegate.updateMany({
      where: { id, status: { in: allowedFrom } },
      data: { status: newStatus },
    })

    if (result.count === 0) {
      // Either the row doesn't exist, or it's already past pending/draft/sent
      const exists = await delegate.findUnique({ where: { id }, select: { id: true, status: true } })
      if (!exists) {
        return apiError("NOT_FOUND", "Data tidak ditemukan")
      }
      return apiError("CONFLICT", `Tidak dapat mengubah status dari '${exists.status}' menjadi '${newStatus}'`)
    }

    revalidatePath(config.revalidate)
    return NextResponse.json({ success: true, status: newStatus })
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2025") {
      return apiError("NOT_FOUND", "Data tidak ditemukan")
    }
    return apiError("INTERNAL_ERROR", "Failed to update status")
  }
}
