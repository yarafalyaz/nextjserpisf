import { prisma } from "@/lib/db/prisma"
import { referenceHref } from "@/lib/utils/format"

/**
 * Menyelesaikan tautan langsung ke dokumen transaksi asli untuk setiap
 * notifikasi yang berisi alur persetujuan (/pengaturan/persetujuan/...).
 *
 * Mengembalikan Map: notificationId -> docHref (misal: /keuangan/jurnal/009-jrn-iro-10-2026)
 */
export async function resolveApprovalDocumentLinks(
  notifications: Array<{ id: number; body: string }>
): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  const slugOrIdToNotifIds = new Map<string, number[]>()

  for (const n of notifications) {
    const match = n.body.match(/\/pengaturan\/persetujuan\/([a-zA-Z0-9_-]+)/)
    if (!match || !match[1]) continue
    const key = match[1]
    const list = slugOrIdToNotifIds.get(key) ?? []
    list.push(n.id)
    slugOrIdToNotifIds.set(key, list)
  }

  if (slugOrIdToNotifIds.size === 0) return result

  const keys = Array.from(slugOrIdToNotifIds.keys())
  const numericIds = keys.filter((k) => /^\d+$/.test(k)).map(Number)

  // Ambil data approval yang cocok dengan slug atau id
  const approvals = await prisma.approval.findMany({
    where: {
      OR: [
        { slug: { in: keys } },
        ...(numericIds.length > 0 ? [{ id: { in: numericIds } }] : []),
      ],
    },
    select: {
      id: true,
      slug: true,
      referenceType: true,
      referenceId: true,
    },
  })

  // Kelompokkan referenceId per model untuk mengambil slug dokumen bisnis aslinya
  const idsByRefType = new Map<string, Set<number>>()
  for (const app of approvals) {
    if (!app.referenceType || !app.referenceId) continue
    const ids = idsByRefType.get(app.referenceType) ?? new Set()
    ids.add(app.referenceId)
    idsByRefType.set(app.referenceType, ids)
  }

  // Model delegasi Prisma mapping
  const MODEL_MAP: Record<string, string> = {
    Journal: "journal",
    Expense: "expense",
    VendorPayment: "vendorPayment",
    VendorBill: "vendorBill",
    LeaveRequest: "leaveRequest",
    OvertimeRequest: "overtimeRequest",
    EmployeeLoan: "employeeLoan",
    Payroll: "payroll",
    Project: "project",
    Asset: "asset",
    Quotation: "quotation",
    SalesOrder: "salesOrder",
    SalesInvoice: "salesInvoice",
    PurchaseRequest: "purchaseRequest",
    PurchaseOrder: "purchaseOrder",
    StockAdjustment: "stockAdjustment",
  }

  const docSlugMap = new Map<string, string>() // key: `${refType}:${id}` -> slug

  await Promise.all(
    Array.from(idsByRefType.entries()).map(async ([refType, idSet]) => {
      const modelKey = MODEL_MAP[refType]
      if (!modelKey) return
      const delegate = (prisma as unknown as Record<string, {
        findMany: (args: unknown) => Promise<Array<{ id: number; slug?: string | null }>>
      }>)[modelKey]
      if (!delegate?.findMany) return

      const rows = await delegate.findMany({
        where: { id: { in: Array.from(idSet) } },
        select: { id: true, slug: true },
      })
      for (const row of rows) {
        if (row.slug) {
          docSlugMap.set(`${refType}:${row.id}`, row.slug)
        }
      }
    })
  )

  for (const app of approvals) {
    const docSlug = docSlugMap.get(`${app.referenceType}:${app.referenceId}`) ?? null
    const href = referenceHref(app.referenceType, app.referenceId, docSlug)
    if (!href) continue

    const matchingNotifIds = [
      ...(app.slug ? slugOrIdToNotifIds.get(app.slug) ?? [] : []),
      ...(slugOrIdToNotifIds.get(String(app.id)) ?? []),
    ]

    for (const notifId of matchingNotifIds) {
      result.set(notifId, href)
    }
  }

  return result
}
