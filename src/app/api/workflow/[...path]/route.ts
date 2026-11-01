
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { revalidatePath } from "next/cache"
import { Status } from "@/lib/constants"
import { apiError } from "@/lib/api-response"
import { approveStep, rejectStep } from "@/actions/approval.actions"
import { requestApprovalIfConfigured } from "@/lib/services/approval-workflow.service"
import { onEmployeeLoanDisbursed } from "@/lib/hooks/accounting.hook"
import { approveOvertime } from "@/actions/hrm.actions"
import { assertCSRF } from "@/lib/security/csrf"
import { APPROVAL_REFERENCE_PERMISSIONS } from "@/lib/auth/approval-permissions"
import { assertHrEmployeeAccess, getHrScope } from "@/lib/auth/hr-scope"


/**
 * Module slug -> Prisma delegate + revalidate path + approval reference type.
 * The permission is NOT stored here: it is derived from
 * APPROVAL_REFERENCE_PERMISSIONS[modelType] so the status-button route and
 * approveStep/rejectStep (the detail-page flow) can never drift apart.
 */
const MODULE_MAP: Record<string, { model: string; modelType: string; revalidate: string; hasCreatedBy?: boolean }> = {
  "penjualan/penawaran": { model: "quotation", modelType: "Quotation", revalidate: "/penjualan/penawaran" },
  "penjualan/pesanan": { model: "salesOrder", modelType: "SalesOrder", revalidate: "/penjualan/pesanan" },
  "penjualan/faktur": { model: "salesInvoice", modelType: "SalesInvoice", revalidate: "/penjualan/faktur" },
  "pembelian/permintaan": { model: "purchaseRequest", modelType: "PurchaseRequest", revalidate: "/pembelian/permintaan" },
  "pembelian/pesanan": { model: "purchaseOrder", modelType: "PurchaseOrder", revalidate: "/pembelian/pesanan" },
  // "pembelian/tagihan" SENGAJA tidak terdaftar: persetujuan tagihan vendor
  // adalah posting (confirmVendorBill) — jurnal AP + balanceDue lahir di
  // sana. Tombol status generik di sini hanya membalik status ke approved
  // tanpa jurnal dan tanpa balanceDue, sesudah itu Konfirmasi hilang
  // (draft-only) dan Bayar terkunci (balanceDue 0): tagihan terkunci
  // permanen. Halaman detail pun sengaja tanpa <StatusActions> generik.
  // Cuti & Lembur TIDAK punya kolom `createdBy` (pemiliknya karyawan, lewat
  // employeeId). Meminta kolom itu ke Prisma melempar validation error sehingga
  // tombol Setujui selalu 500 — flag ini yang mencegahnya, dan dijaga oleh
  // src/__tests__/approval-initiator-parity.test.ts.
  "sdm/cuti": { model: "leaveRequest", modelType: "LeaveRequest", revalidate: "/sdm/cuti", hasCreatedBy: false },
  "sdm/lembur": { model: "overtimeRequest", modelType: "OvertimeRequest", revalidate: "/sdm/lembur", hasCreatedBy: false },
  // EmployeeLoan approval/disbursement used to be gated by "create_loans",
  // which let whoever raised a loan also approve + disburse it. The dedicated
  // "approve_loans" permission (see approval-permissions.ts) separates them.
  "sdm/pinjaman": { model: "employeeLoan", modelType: "EmployeeLoan", revalidate: "/sdm/pinjaman" },
}

/**
 * Baseline status guard when no active approval workflow is configured.
 * Extracted as a named constant so the manual approve/reject path and its
 * parity test share one definition. "approved" is deliberately NOT in the
 * list: once a document is approved the manual button no longer offers the
 * action (see StatusActions), and re-running approve would re-fire side
 * effects such as employee-loan disbursement.
 */
const STATUS_ALLOWED_FROM = ["pending", "draft", "sent"]

// R6PA-05: model HR lahir langsung `pending`; klaim generik approval
// (APPROVE_CLAIMS/REJECT_CLAIMS) juga hanya menerima pending. Draft/sent
// bukan pre-state sah ketiga model ini di jalur manual.
const MANUAL_STATUS_ALLOWED_FROM: Record<string, string[]> = {
  LeaveRequest: ["pending"],
  OvertimeRequest: ["pending"],
  EmployeeLoan: ["pending"],
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
  // Tolak bentuk yang Number() terima diam-diam ("1e3", "0x10", "+5", " 5"):
  // Prisma menolaknya sebagai 500, padahal id bukan desimal murni = 400.
  if (!/^\d+$/.test(idRaw)) {
    return apiError("BAD_REQUEST", "ID tidak valid")
  }
  const id = Number(idRaw)
  if (!Number.isSafeInteger(id) || id <= 0) {
    return apiError("BAD_REQUEST", "ID tidak valid")
  }

  const moduleKey = path.slice(0, path.length - 2).join("/")

  const config = MODULE_MAP[moduleKey]
  if (!config) {
    return apiError("NOT_FOUND", "Modul tidak ditemukan")
  }

  // Permission check — super_admin bypasses. The permission is derived from
  // the shared reference map so this route and approveStep/rejectStep cannot
  // disagree about who may approve a given document type.
  const userRoles = session.user.roles as string[] | undefined
  const userPermissions = session.user.permissions as string[] | undefined
  const requiredPermission = APPROVAL_REFERENCE_PERMISSIONS[config.modelType]
  if (!requiredPermission) {
    return apiError("INTERNAL_ERROR", "Izin approval untuk modul ini belum dipetakan")
  }
  if (!userRoles?.includes("super_admin") && !userPermissions?.includes(requiredPermission)) {
    return apiError("FORBIDDEN", "Anda tidak memiliki izin untuk aksi ini")
  }

  if (action !== "approve" && action !== "reject") {
    return apiError("BAD_REQUEST", "Aksi tidak valid")
  }

  const modelType = config.modelType

  // HR model types (cuti/lembur/pinjaman) punya employeeId pemilik dokumen.
  // Dipakai cabang workflow-aktif DAN manual untuk cek scope SEBELUM mutasi apa pun.
  const HR_MODELS = new Set(["leaveRequest", "overtimeRequest", "employeeLoan"])

  try {
    await assertCSRF()
    if (modelType) {
      const activeWorkflow = await prisma.approvalWorkflow.findFirst({
        where: { modelType, isActive: true, deletedAt: null },
      })

      if (activeWorkflow) {
        // HR scope SEBELUM mutasi: cabang workflow-aktif dulu reset
        // rejected→draft + buat approval baru, baru cek scope di cabang
        // manual — pemegang izin approve luar scope bisa membangkitkan
        // dokumen HR lalu menerima 409 sesudah mutasi commit (BUGHUNT #8).
        // Cek di sini menolak sebelum requestApprovalIfConfigured/reset.
        if (HR_MODELS.has(config.model)) {
          const delegateScope = prisma[config.model as keyof typeof prisma] as any
          const hrDoc = await delegateScope.findUnique({
            where: { id },
            select: { employeeId: true },
          })
          if (!hrDoc) {
            return apiError("NOT_FOUND", "Data tidak ditemukan")
          }
          try {
            const scope = await getHrScope({
              id: String(session.user.id),
              roles: userRoles ?? [],
              permissions: userPermissions ?? [],
            })
            await assertHrEmployeeAccess(scope, hrDoc.employeeId)
          } catch {
            return apiError("FORBIDDEN", "Anda tidak memiliki akses ke data karyawan ini")
          }
        }

        let approval = await prisma.approval.findFirst({
          where: { referenceType: modelType, referenceId: id },
          orderBy: { id: "desc" },
        })

        // R7API-03: pencetus approval — dipakai jalur inisiasi di bawah DAN
        // reopen. JANGAN aktor yang menekan tombol: maker-checker di
        // approveStep/rejectStep akan menolak aktor menyetujui buatannya
        // sendiri, tapi mutasi reset+approval baru sudah terlanjur commit.
        let docCreator: number | null = null
        if (config.hasCreatedBy === false) {
          // Model HR tak punya createdBy: pemilik dokumen = employee.userId.
          const delegateCreator = prisma[config.model as keyof typeof prisma] as any
          const hrDoc = await delegateCreator
            .findUnique({ where: { id }, select: { employee: { select: { userId: true } } } })
            .catch((): null => null)
          docCreator = hrDoc?.employee?.userId != null ? Number(hrDoc.employee.userId) : null
        } else {
          const delegateCreator = prisma[config.model as keyof typeof prisma] as any
          const doc = await delegateCreator
            .findUnique({ where: { id }, select: { createdBy: true } })
            .catch((): null => null)
          docCreator = doc?.createdBy != null ? Number(doc.createdBy) : null
        }

        if (!approval) {
          // Inisiator = pembuat dokumen (docCreator di atas); kolom
          // `createdBy` hanya ditanyakan pada model yang punya (MODULE_MAP).
          await requestApprovalIfConfigured(modelType, id, docCreator ?? Number(session.user.id))
          approval = await prisma.approval.findFirst({
            where: { referenceType: modelType, referenceId: id },
            orderBy: { id: "desc" },
          })
        }

        if (!approval) {
          return apiError("INTERNAL_ERROR", "Gagal menginisiasi alur persetujuan")
        }

        // Buka approval kalau ditolak: reset doc ke draft + buat approval baru.
        // catch mencatat konteks lalu menelan: updateMany ke model dinamis
        // boleh gagal (model tak dikenal / kolom status beda) dan alur tetap
        // lanjut — yang menentukan adalah fresh berstatus pending di bawah.
        if (approval.status === "rejected") {
          const delegateReopen = prisma[config.model as keyof typeof prisma] as any
          try {
            await delegateReopen.updateMany({
              where: { id, status: "rejected" },
              data: { status: "draft" },
            })
          } catch (err) {
            console.error(`[workflow] reset status ${config.model} #${id} gagal:`, err)
          }
          // R7API-03: pencetus approval baru = requestedBy approval yang
          // ditolak (pengaju asal); fallback pembuat dokumen, lalu aktor.
          // Menulis aktor di sini membuat klik Setujui/Tolak berikutnya
          // selalu kena maker-checker (409) sesudah mutasi commit.
          await requestApprovalIfConfigured(
            modelType,
            id,
            approval.requestedBy ?? docCreator ?? Number(session.user.id),
          )
          const fresh = await prisma.approval.findFirst({
            where: { referenceType: modelType, referenceId: id },
            orderBy: { id: "desc" },
          })
          if (!fresh || fresh.status !== "pending") {
            return apiError("CONFLICT", `Alur persetujuan ditolak — gagal membuka ulang`)
          }
          // Dokumen sudah dibuka ulang (draft + approval pending baru) —
          // JANGAN lanjut approve/reject dalam request yang sama: aksi
          // aktor atas pengajuan yang baru lahir bukan persetujuan atas
          // dokumen yang ia klik, dan requestedBy yang tidak ter-resolve
          // tetap bisa menyentuh aktor. Balas jujur; klik kedua memproses
          // langkah pertama dari halaman yang sudah termuat ulang.
          revalidatePath(config.revalidate)
          return NextResponse.json({ success: true, status: "pending", reopened: true })
        }

        if (approval.status === "approved") {
          return apiError("CONFLICT", `Alur persetujuan sudah selesai dengan status '${approval.status}'`)
        }

        const formData = new FormData()
        formData.append("notes", action === "approve" ? "Disetujui via tombol status" : "Ditolak via tombol status")

        // approveStep/rejectStep melempar Error domain saat gagal (sudah
        // diproses, maker-checker, gerbang statutori, ...). Jangan telan:
        // tanpa tangkapan eksplisit di sini kegagalan bisa jatuh ke cabang
        // "pending" di bawah dan terbalas 200 sukses palsu.
        try {
          if (action === "approve") {
            await approveStep(approval.id, formData)
          } else {
            await rejectStep(approval.id, formData)
          }
        } catch (stepError) {
          if (
            stepError instanceof Error &&
            (stepError.message.startsWith("CSRF validation failed:") ||
              ("code" in stepError && (stepError as { code?: string }).code === "P2025"))
          ) {
            throw stepError
          }
          // R7API-04: error domain adalah `throw new Error(...)` polos dari
          // approval.actions (tanpa code Prisma/driver). Error bercode
          // (P2002, driver adapter, dst.) adalah fault server — JANGAN
          // kirim .message mentahnya sebagai 409; catat + balas generik.
          // ponytail: domain-error type khusus akan menggantikan heuristik
          // code bila approval.actions mengadopsi kelas error sendiri.
          const hasErrorCode =
            stepError instanceof Error &&
            "code" in stepError &&
            typeof (stepError as { code?: unknown }).code === "string"
          console.error("[api/workflow] langkah persetujuan gagal:", stepError)
          if (hasErrorCode || !(stepError instanceof Error)) {
            return apiError("INTERNAL_ERROR", "Gagal memproses langkah persetujuan")
          }
          return apiError("CONFLICT", stepError.message)
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
          // Domain side-effect on completion: approving overtime must COMPUTE the
          // pay value (calculatedValue) — the approval engine only flips status,
          // it never runs domain logic. Without this, workflow-approved overtime
          // carried calculatedValue = 0 and the overtime pay silently vanished
          // from payroll. approveOvertime is idempotent, so a repeat click is a
          // no-op.
          if (modelType === "OvertimeRequest" && updatedApproval.status === "approved") {
            const result = await approveOvertime(id)
            if (result && result.success === false) {
              return apiError("INTERNAL_ERROR", result.error || "Gagal menghitung nilai lembur")
            }
          }
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
    const allowedFrom = MANUAL_STATUS_ALLOWED_FROM[modelType] ?? STATUS_ALLOWED_FROM
    const delegate = prisma[config.model as keyof typeof prisma] as any

    // Maker-Checker untuk jalur manual (tanpa workflow aktif): pembuat dokumen
    // tidak boleh menyetujui/menolaknya sendiri. super_admin bypass (konsisten
    // dengan approveStep/rejectStep). Cuti/lembur tidak punya createdBy:
    // kepemilikan lewat employee.userId, jadi cek itu bila ada.
    if (action === "approve" || action === "reject") {
      const actorId = Number(session.user.id)
      if (!userRoles?.includes("super_admin") && Number.isSafeInteger(actorId)) {
        let makerId: number | null = null
        if (config.model === "leaveRequest" || config.model === "overtimeRequest") {
          const doc = await delegate.findUnique({
            where: { id },
            select: { employee: { select: { userId: true } } },
          })
          makerId = doc?.employee?.userId != null ? Number(doc.employee.userId) : null
        } else {
          const doc = await delegate.findUnique({ where: { id }, select: { createdBy: true } })
          makerId = doc?.createdBy != null ? Number(doc.createdBy) : null
        }
        if (makerId !== null && makerId === actorId) {
          return apiError("FORBIDDEN", "Maker-Checker: pembuat dokumen tidak boleh menyetujui/menolaknya sendiri")
        }
      }
      // HR scope jalur manual: LeaveRequest/OvertimeRequest/EmployeeLoan
      // hanya boleh di-approve/reject bila karyawan dokumen dalam scope HR aktor.
      if (HR_MODELS.has(config.model)) {
        const doc = await delegate.findUnique({
          where: { id },
          select: { employeeId: true },
        })
        if (!doc) {
          return apiError("NOT_FOUND", "Data tidak ditemukan")
        }
        try {
          const scope = await getHrScope({
            id: String(session.user.id),
            roles: userRoles ?? [],
            permissions: userPermissions ?? [],
          })
          await assertHrEmployeeAccess(scope, doc.employeeId)
        } catch {
          return apiError("FORBIDDEN", "Anda tidak memiliki akses ke data karyawan ini")
        }
      }
    }

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
    } else if (modelType === "OvertimeRequest" && newStatus === Status.APPROVED) {
      // No workflow configured: this status button is the only approval gate.
      // Route through approveOvertime so the pay value (calculatedValue) is
      // computed — a plain status flip would leave it 0 and drop the pay from
      // payroll.
      const res = await approveOvertime(id)
      if (res && res.success === false) {
        return apiError("CONFLICT", res.error || "Gagal menyetujui lembur")
      }
      result = { count: 1 }
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
    // Jangan kirim `error.message` ke klien: pesan Prisma memuat dump skema
    // (nama model + seluruh daftar kolomnya). Catat di server, balas generik.
    console.error("[api/workflow] gagal memperbarui status:", error)
    return apiError("INTERNAL_ERROR", "Gagal memperbarui status")
  }
}
