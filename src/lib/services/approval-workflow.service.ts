import { prisma } from "@/lib/db/prisma"
import { nextSlugWithClient } from "@/lib/utils/slug-db"
import { notificationService } from "@/lib/services/notification.service"
import { APPROVAL_MODEL_LABELS } from "@/lib/constants/approval"
import { getApprovalDocDelegate } from "@/lib/approval/approval-models"

interface ApprovalStepApproverTarget {
  referenceType: string
  referenceId: number
  currentStep: number
  requestedBy?: number | null
  slug?: string | null
}

/**
 * R6WN-03: beri tahu approver langkah berjalan bahwa approval menunggu.
 * Penerima cermin assertStepApprover: userId terisi -> user aktif itu saja;
 * kalau tidak, roleId -> semua user aktif ber-role itu. requestedBy
 * dikeluarkan (maker tidak mengejar approval sendiri). Kegagalan notifikasi
 * tidak boleh menggagalkan dokumen pemanggil — tercatat di log server saja.
 * Menulis lewat `db` pemanggil supaya ikut transaksi dokumen.
 */
export async function notifyApprovalStepApprovers(
  db: any,
  approval: ApprovalStepApproverTarget,
  steps: Array<{ stepOrder: number; roleId: number | null; userId: number | null; name?: string | null }>,
): Promise<void> {
  try {
    const step = steps.find((s) => s.stepOrder === approval.currentStep)
    if (!step || (step.userId == null && step.roleId == null)) return

    let recipientIds: number[] = []
    if (step.userId != null) {
      const target = await db.user.findFirst({
        where: { id: step.userId, isActive: true },
        select: { id: true },
      })
      if (target) recipientIds = [target.id]
    } else if (step.roleId != null) {
      const roleUsers = await db.user.findMany({
        where: { isActive: true, roles: { some: { id: step.roleId } } },
        select: { id: true },
      })
      recipientIds = roleUsers.map((u: { id: number }) => u.id)
    }

    // Super admin selalu diikutsertakan sebagai penerima notifikasi persetujuan
    // agar memiliki visibilitas atas semua antrean persetujuan yang sedang menunggu.
    const superAdmins = await db.user.findMany({
      where: { isActive: true, roles: { some: { name: "super_admin" } } },
      select: { id: true },
    })
    const superAdminIds = superAdmins.map((u: { id: number }) => u.id)
    recipientIds = [...recipientIds, ...superAdminIds]

    recipientIds = [...new Set(recipientIds)].filter((id) => id !== approval.requestedBy)
    if (recipientIds.length === 0) return

    const label = APPROVAL_MODEL_LABELS[approval.referenceType] ?? approval.referenceType
    const targetPath = approval.slug ?? approval.referenceId
    let docIdentifier = `#${approval.referenceId}`

    // Ambil nomor dokumen manusiawi bila model mendukung (mis. journalNumber, orderNumber, dll)
    const docModelDelegate = getApprovalDocDelegate(db, approval.referenceType)
    if (docModelDelegate?.findUnique) {
      const doc = await docModelDelegate.findUnique({
        where: { id: approval.referenceId },
        select: {
          journalNumber: true,
          orderNumber: true,
          invoiceNumber: true,
          requestNumber: true,
          quotationNumber: true,
          adjustmentNumber: true,
          transferNumber: true,
          code: true,
          name: true,
        },
      })
      const customNumber =
        doc?.journalNumber ||
        doc?.orderNumber ||
        doc?.invoiceNumber ||
        doc?.requestNumber ||
        doc?.quotationNumber ||
        doc?.adjustmentNumber ||
        doc?.transferNumber ||
        doc?.code ||
        doc?.name
      if (customNumber) docIdentifier = customNumber
    }

    await notificationService.notifyUsers(
      recipientIds,
      `Persetujuan Menunggu: ${label} ${docIdentifier}`,
      `${label} ${docIdentifier} menunggu persetujuan langkah ${approval.currentStep}${step.name ? ` (${step.name})` : ""}. Buka /pengaturan/persetujuan/${targetPath}`,
      "info",
      db,
    )
  } catch (err) {
    console.error(
      `[notifyApprovalStepApprovers] Gagal mengirim notifikasi approver ${approval.referenceType} #${approval.referenceId} langkah ${approval.currentStep}:`,
      err,
    )
  }
}

async function notifyNewApprovalStep(db: any, workflowId: number, approval: ApprovalStepApproverTarget): Promise<void> {
  const steps = await db.approvalWorkflowStep.findMany({
    where: { workflowId },
    orderBy: { stepOrder: "asc" },
  })
  await notifyApprovalStepApprovers(db, approval, steps)
}

/**
 * Generic approval-workflow integration.
 * Kalau status sebelumnya `rejected`, buka approval baru (resubmit) supaya
 * dokumen bisa diajukan ulang — sebelumnya CONFLICT terminal.
 */

/**
 * R6WN-01: tipe yang isinya bisa diedit sesudah approval final (dokumen tetap
 * draft/approved-editable, posting digerbang assertApproved). Untuk tipe ini
 * approval `approved` menjadi BASI begitu dokumen berubah
 * (`updatedAt > approval.completedAt`) dan harus diajukan ulang.
 */
const STALE_ON_EDIT_TYPES = new Set([
  "Journal",
  "VendorPayment",
  "StockAdjustment",
  "SalesInvoice",
  // Asset: approval lahir saat createAsset, tetapi disposeAsset hanya
  // menggerbang assertApproved — tanpa ikut daftar basi, edit material
  // sesudah approval final (harga/tanggal/kategori) tetap lolos disposal
  // berbekal persetujuan atas fakta yang sudah tidak berlaku.
  "Asset",
  // Quotation: approval final mem-flip draft/sent -> approved, tetapi
  // updateQuotation tetap mengizinkan edit status approved (customer,
  // sections/items, total) dan konversi hanya menggerbang
  // assertApproved — tanpa ikut daftar basi, SalesOrder lahir dari isi
  // yang tidak pernah disetujui dalam bentuk finalnya.
  "Quotation",
  // Project: approval lahir saat createProject, tetapi updateProject tetap
  // mengizinkan edit material (pelanggan/kendaraan/kontrak) dan gerbang
  // lanjutan mengandalkan assertApproved — tanpa ikut daftar basi, proyek bisa
  // diganti sesudah approval final dan memakai persetujuan atas isi lama.
  "Project",
]);

/** Model dokumen untuk cek kebasian; null = tipe tidak mendukung cek ini. */
function staleCheckModel(db: any, referenceType: string): any | null {
  if (!STALE_ON_EDIT_TYPES.has(referenceType)) return null;
  const modelKey = referenceType.charAt(0).toLowerCase() + referenceType.slice(1);
  return db?.[modelKey] ?? null;
}

export async function requestApprovalIfConfigured(
  referenceType: string,
  referenceId: number,
  requestedBy?: number,
  txClient?: any,
): Promise<boolean> {
  const createApproval = async (db: any, workflowId: number): Promise<true> => {
    // Putaran 78: slug lewat delegate transaksi pemanggil — varian global tidak
    // melihat approval tak-tercommit dari createAsset/pemanggil lain yang
    // berbagi stem sama, sehingga dua dokumen konkuren bisa memilih slug sama
    // dan yang kalah menerima P2002 sesudah dokumennya sudah ter-commit.
    const slug = await nextSlugWithClient(db as never, "approval", referenceType)
    await db.approval.create({
      data: {
        workflowId,
        referenceType,
        slug,
        referenceId,
        currentStep: 1,
        status: "pending",
        requestedBy: requestedBy ?? null,
        requestedAt: new Date(),
      },
    })
    // R6WN-03: notifikasi approver langkah 1 (se-transaksi; gagal log saja).
    await notifyNewApprovalStep(db, workflowId, {
      referenceType,
      referenceId,
      currentStep: 1,
      requestedBy: requestedBy ?? null,
      slug,
    })
    return true
  }

  const request = async (db: any): Promise<boolean> => {
    const [lockedWorkflow] = await db.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM approval_workflows
      WHERE model_type = ${referenceType} AND is_active = 1 AND deleted_at IS NULL
      ORDER BY priority DESC
      LIMIT 1 FOR UPDATE
    `
    if (!lockedWorkflow) return false

    const existing = await db.approval.findFirst({
      where: { referenceType, referenceId },
      orderBy: { id: "desc" },
    })
    if (existing) {
      if (existing.status === "pending") return true
      if (existing.status === "rejected") return createApproval(db, lockedWorkflow.id)
      if (existing.status === "approved") {
        // R6WN-01: edit dokumen sesudah approval final membuka pengajuan baru
        // — approval lama tidak boleh menggerbang isi yang tidak pernah
        // disetujui. Tipe di luar daftar basi tetap perilaku lama.
        const docModel = staleCheckModel(db, referenceType)
        if (docModel?.findUnique && existing.completedAt) {
          const doc = await docModel.findUnique({
            where: { id: referenceId },
            select: { updatedAt: true },
          })
          if (doc?.updatedAt && doc.updatedAt.getTime() > existing.completedAt.getTime()) {
            return createApproval(db, lockedWorkflow.id)
          }
        }
      }
      return false
    }

    return createApproval(db, lockedWorkflow.id)
  }

  if (txClient) return request(txClient)
  return prisma.$transaction((tx) => request(tx))
}

export async function assertApproved(
  referenceType: string,
  referenceId: number,
  txClient?: any,
): Promise<void> {
  const db = txClient ?? prisma
  if (!db.approval) return
  const approval = await db.approval.findFirst({
    where: { referenceType, referenceId },
    orderBy: { id: "desc" },
  })
  if (!approval) return
  if (approval.status === "approved") {
    // R6WN-01 fail-closed: approval final yang lebih tua dari edit terakhir
    // dokumen tidak menggerbang posting isi baru. Edit mengharapkan
    // requestApprovalIfConfigured (dipanggil action update) sudah membuka
    // pengajuan pending baru; di sini sisa lubangnya ditutup.
    const docModel = staleCheckModel(db as any, referenceType)
    if (docModel?.findUnique && approval.completedAt) {
      const doc = await docModel.findUnique({
        where: { id: referenceId },
        select: { updatedAt: true },
      })
      if (doc?.updatedAt && doc.updatedAt.getTime() > approval.completedAt.getTime()) {
        throw new Error("Dokumen berubah sesudah persetujuan final — ajukan ulang persetujuan sebelum dilanjutkan.")
      }
    }
    return
  }
  if (approval.status === "rejected") {
    throw new Error("Dokumen ditolak pada alur persetujuan dan tidak dapat dilanjutkan.")
  }
  throw new Error("Dokumen masih menunggu persetujuan (approval workflow) sebelum dapat dilanjutkan.")
}
