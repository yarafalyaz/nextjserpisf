import { prisma } from "@/lib/db/prisma"
import { nextSlug } from "@/lib/utils/slug-db"

/**
 * Generic approval-workflow integration.
 * Kalau status sebelumnya `rejected`, buka approval baru (resubmit) supaya
 * dokumen bisa diajukan ulang — sebelumnya CONFLICT terminal.
 */

/**
 * R6WN-01: tipe yang isinya bisa diedit sesudah approval final (dokumen tetap
 * draft/approved-editable, posting digerbang assertApproved). Untuk tipe ini
 * approval `approved` menjadi BASI begitu dokumen berubah
 * (`updatedAt > approval.completedAt`) dan harus diajukan ulang; tipe lain
 * (mis. Quotation) status dokumennya sendiri yang berubah final, jadi tidak
 * ikut aturan basi ini.
 */
const STALE_ON_EDIT_TYPES = new Set([
  "Journal",
  "VendorPayment",
  "StockAdjustment",
  "SalesInvoice",
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
    await db.approval.create({
      data: {
        workflowId,
        referenceType,
        slug: await nextSlug("approval", referenceType),
        referenceId,
        currentStep: 1,
        status: "pending",
        requestedBy: requestedBy ?? null,
        requestedAt: new Date(),
      },
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

export async function assertApproved(referenceType: string, referenceId: number): Promise<void> {
  if (!prisma.approval) return
  const approval = await prisma.approval.findFirst({
    where: { referenceType, referenceId },
    orderBy: { id: "desc" },
  })
  if (!approval) return
  if (approval.status === "approved") {
    // R6WN-01 fail-closed: approval final yang lebih tua dari edit terakhir
    // dokumen tidak menggerbang posting isi baru. Edit mengharapkan
    // requestApprovalIfConfigured (dipanggil action update) sudah membuka
    // pengajuan pending baru; di sini sisa lubangnya ditutup.
    const docModel = staleCheckModel(prisma as any, referenceType)
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
