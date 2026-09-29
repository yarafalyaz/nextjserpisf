
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { revalidatePath } from "next/cache"
import { Status } from "@/lib/constants"
import { apiError } from "@/lib/api-response"
import { approveStep, rejectStep } from "@/actions/approval.actions"
import { requestApprovalIfConfigured } from "@/lib/services/approval-workflow.service"
import { onEmployeeLoanDisbursed } from "@/lib/hooks/accounting.hook"
import { assertCSRF } from "@/lib/security/csrf"


const MODULE_MAP: Record<string, { model: string; revalidate: string; permission: string }> = {
  "penjualan/penawaran": { model: "quotation", revalidate: "/penjualan/penawaran", permission: "approve_quotations" },
  "penjualan/pesanan": { model: "salesOrder", revalidate: "/penjualan/pesanan", permission: "approve_sales_orders" },
  "penjualan/faktur": { model: "salesInvoice", revalidate: "/penjualan/faktur", permission: "approve_sales_invoices" },
  "pembelian/permintaan": { model: "purchaseRequest", revalidate: "/pembelian/permintaan", permission: "approve_purchase_requests" },
  "pembelian/pesanan": { model: "purchaseOrder", revalidate: "/pembelian/pesanan", permission: "approve_purchase_orders" },
  "pembelian/tagihan": { model: "vendorBill", revalidate: "/pembelian/tagihan", permission: "approve_vendor_bills" },
  "sdm/cuti": { model: "leaveRequest", revalidate: "/sdm/cuti", permission: "approve_leave_requests" },
  "sdm/lembur": { model: "overtimeRequest", revalidate: "/sdm/lembur", permission: "approve_overtime_requests" },
  "sdm/pinjaman": { model: "employeeLoan", revalidate: "/sdm/pinjaman", permission: "create_loans" },
}

const MODEL_TYPE_MAP: Record<string, string> = {
  quotation: "Quotation",
  salesOrder: "SalesOrder",
  salesInvoice: "SalesInvoice",
  purchaseRequest: "PurchaseRequest",
  purchaseOrder: "PurchaseOrder",
  vendorBill: "VendorBill",
  leaveRequest: "LeaveRequest",
  overtimeRequest: "OvertimeRequest",
  employeeLoan: "EmployeeLoan",
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
  if (!Array.isArray(path) || path.length < 3) {
    return apiError("BAD_REQUEST", "Path tidak valid")
  }

  const action = path[path.length - 1] // "approve" or "reject"
  const idRaw = path[path.length - 2]
  const id = Number(idRaw)
  if (!Number.isSafeInteger(id) || id <= 0) {
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

  const modelType = MODEL_TYPE_MAP[config.model]

  try {
    await assertCSRF()
    if (modelType) {
      const activeWorkflow = await prisma.approvalWorkflow.findFirst({
        where: { modelType, isActive: true, deletedAt: null },
      })

      if (activeWorkflow) {
        let approval = await prisma.approval.findFirst({
          where: { referenceType: modelType, referenceId: id },
          orderBy: { id: "desc" },
        })

        if (!approval) {
          const delegate = prisma[config.model as keyof typeof prisma] as any
          const doc = await delegate.findUnique({ where: { id }, select: { createdBy: true } })
          const docCreatedBy = doc?.createdBy ? Number(doc.createdBy) : Number(session.user.id)
          await requestApprovalIfConfigured(modelType, id, docCreatedBy)
          approval = await prisma.approval.findFirst({
            where: { referenceType: modelType, referenceId: id },
            orderBy: { id: "desc" },
          })
        }

        if (!approval) {
          return apiError("INTERNAL_ERROR", "Gagal menginisiasi alur persetujuan")
        }

        if (approval.status === "approved" || approval.status === "rejected") {
          return apiError("CONFLICT", `Alur persetujuan sudah selesai dengan status '${approval.status}'`)
        }

        const formData = new FormData()
        formData.append("notes", action === "approve" ? "Disetujui via tombol status" : "Ditolak via tombol status")

        if (action === "approve") {
          await approveStep(approval.id, formData)
        } else {
          await rejectStep(approval.id, formData)
        }

        const updatedApproval = await prisma.approval.findUnique({
          where: { id: approval.id },
        })

        if (!updatedApproval) {
          return apiError("INTERNAL_ERROR", "Gagal membaca pembaruan alur persetujuan")
        }

        if (updatedApproval.status === "approved" || updatedApproval.status === "rejected") {
          const docStatus = modelType === "EmployeeLoan"
            ? (updatedApproval.status === "approved" ? "active" : Status.REJECTED)
            : (updatedApproval.status === "approved" ? Status.APPROVED : Status.REJECTED)
          revalidatePath(config.revalidate)
          return NextResponse.json({ success: true, status: docStatus })
        }

        const delegate = prisma[config.model as keyof typeof prisma] as any
        await delegate.updateMany({
          where: { id, status: { in: ["draft", "pending"] } },
          data: { status: "pending" },
        })

        revalidatePath(config.revalidate)
        return NextResponse.json({ success: true, status: "pending" })
      }
    }

    let newStatus: string = action === "approve" ? Status.APPROVED : Status.REJECTED
    if (config.model === "employeeLoan" && newStatus === Status.APPROVED) {
      newStatus = "active"
    }
    const allowedFrom = ["pending", "draft", "sent"]
    const delegate = prisma[config.model as keyof typeof prisma] as any

    let result
    if (config.model === "employeeLoan" && newStatus === "active") {
      result = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.employeeLoan.updateMany({
          where: { id, status: { in: allowedFrom } },
          data: { status: "active" },
        })
        if (updateResult.count > 0) {
          await onEmployeeLoanDisbursed(id, Number(session.user.id), tx)
        }
        return updateResult
      })
    } else {
      result = await delegate.updateMany({
        where: { id, status: { in: allowedFrom } },
        data: { status: newStatus },
      })
    }

    if (result.count === 0) {
      const exists = await delegate.findUnique({ where: { id }, select: { id: true, status: true } })
      if (!exists) {
        return apiError("NOT_FOUND", "Data tidak ditemukan")
      }
      return apiError("CONFLICT", `Tidak dapat mengubah status dari '${exists.status}' menjadi '${newStatus}'`)
    }

    revalidatePath(config.revalidate)
    return NextResponse.json({ success: true, status: newStatus })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CSRF validation failed:")) {
      return apiError("FORBIDDEN", "Permintaan lintas situs ditolak")
    }
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2025") {
      return apiError("NOT_FOUND", "Data tidak ditemukan")
    }
    return apiError("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to update status")
  }
}
