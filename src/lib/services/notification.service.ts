
import { prisma } from '@/lib/db/prisma'

export interface LowStockItem {
  id: number
  name: string
  qtyOnHand: number
  minStock: number
}

export interface WarehouseLowStockItem {
  itemId: number
  itemName: string
  warehouseId: number
  warehouseName: string
  qtyAtWarehouse: number
  minStock: number
}

interface OverdueInvoice {
  id: number
  documentNo: string
  customerName?: string
  dueDate: Date | string
  grandTotal: number | string
  paidAmount: number | string
}

interface LateCheckIn {
  id: number
  name: string
  departmentName?: string
}

type DocumentType = 'WorkOrder' | 'SalesOrder' | 'SalesInvoice'

/**
 * Notification service for system-wide alerts.
 * Handles admin notifications, user-specific notifications,
 * and automated low-stock warnings.
 */
export const notificationService = {
  /**
   * Send a notification to all active admin and super_admin users.
   */
  async notifyAdmins(title: string, body: string, type: string = 'info'): Promise<void> {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { name: { in: ['super_admin', 'admin'] } } },
      },
      select: { id: true },
    })

    if (admins.length === 0) return

    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title,
        body,
        type,
        readAt: null,
      })),
    })
  },

  /**
   * Send a notification to a specific user.
   */
  async notifyUser(
    userId: number,
    title: string,
    body: string,
    type: string = 'info'
  ): Promise<void> {
    await prisma.notification.create({
      data: { userId, title, body, type },
    })
  },

  /**
   * Send notifications to multiple users at once.
   */
  async notifyUsers(
    userIds: number[],
    title: string,
    body: string,
    type: string = 'info'
  ): Promise<void> {
    if (userIds.length === 0) return

    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title,
        body,
        type,
        readAt: null,
      })),
    })
  },

  /**
   * Idempotent variant of notifyUsers for re-runnable callers (cron):
   * skip when a notification with same title already exists for any
   * recipient since `since`. Returns rows written (0 when skipped).
   * ponytail: title-keyed dedupe, race window = two concurrent runs same
   * title; upgrade to unique dedupe-key column if cron runs parallel.
   */
  async notifyUsersIfNew(
    userIds: number[],
    title: string,
    body: string,
    type: string = 'info',
    since: Date
  ): Promise<number> {
    if (userIds.length === 0) return 0

    const existing = await prisma.notification.findFirst({
      where: { userId: { in: userIds }, title, createdAt: { gte: since } },
      select: { id: true },
    })
    if (existing) return 0

    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title,
        body,
        type,
        readAt: null,
      })),
    })
    return userIds.length
  },

  /**
   * Batched variant of notifyUsersIfNew: dedupe per title in ONE findMany
   * (titles already sent to any recipient since `since` are skipped), then
   * ONE createMany for the rest. Semantics identical to looping
   * notifyUsersIfNew per entry — each title independent — without N×2
   * round-trips. Returns rows written.
   */
  async notifyUsersIfNewBatch(
    userIds: number[],
    entries: { title: string; body: string; type?: string }[],
    since: Date
  ): Promise<number> {
    if (userIds.length === 0 || entries.length === 0) return 0

    const existing = await prisma.notification.findMany({
      where: {
        userId: { in: userIds },
        title: { in: entries.map((e) => e.title) },
        createdAt: { gte: since },
      },
      select: { title: true },
    })
    const existingTitles = new Set(existing.map((n) => n.title))
    const fresh = entries.filter((e) => !existingTitles.has(e.title))
    if (fresh.length === 0) return 0

    await prisma.notification.createMany({
      data: userIds.flatMap((userId) =>
        fresh.map((e) => ({
          userId,
          title: e.title,
          body: e.body,
          type: e.type ?? 'info',
          readAt: null,
        })),
      ),
    })
    return userIds.length * fresh.length
  },

  /**
   * Check if an item's stock is below minimum threshold and notify admins.
   * NOTE: not idempotent — each call creates fresh notifications. Callers that
   * may run repeatedly for the same item/period must dedupe themselves (see the
   * low-stock cron, which de-dupes per period).
   */
  async checkAndNotifyLowStock(item: LowStockItem): Promise<void> {
    if (item.minStock > 0 && item.qtyOnHand <= item.minStock) {
      await this.notifyAdmins(
        `Stok ${item.name} Menipis`,
        `Stok saat ini: ${item.qtyOnHand} (Minimum: ${item.minStock}). Segera lakukan pembelian.`,
        'warning'
      )
    }
  },

  /**
   * Batched version: notify admins about multiple low-stock items in one round-trip.
   * Replaces N×(admin findMany + notification createMany) with 1+1 queries.
   * Admin lookup is done once, then a single `createMany` creates all notifications.
   */
  async checkAndNotifyLowStockBatch(items: LowStockItem[]): Promise<number> {
    const low = items.filter((i) => i.minStock > 0 && i.qtyOnHand <= i.minStock)
    if (low.length === 0) return 0

    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { name: { in: ['super_admin', 'admin'] } } },
      },
      select: { id: true },
    })
    if (admins.length === 0) return 0

    const notifications = admins.flatMap((admin) =>
      low.map((item) => ({
        userId: admin.id,
        title: `Stok ${item.name} Menipis`,
        body: `Stok saat ini: ${item.qtyOnHand} (Minimum: ${item.minStock}). Segera lakukan pembelian.`,
        type: 'warning' as const,
        readAt: null,
      })),
    )

    await prisma.notification.createMany({ data: notifications })
    return notifications.length
  },

  /**
   * F-2026-10-22-070-S (BR-MS-05): peringatan menipis per (barang, gudang)
   * dengan minimum efektif. Judul menyebut gudang supaya pasangan sama di
   * gudang beda tidak tertukar; dedupe pemanggil (cron) per judul ini.
   */
  async checkAndNotifyWarehouseLowStockBatch(items: WarehouseLowStockItem[]): Promise<number> {
    const low = items.filter((i) => i.minStock > 0 && i.qtyAtWarehouse <= i.minStock)
    if (low.length === 0) return 0

    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { name: { in: ['super_admin', 'admin'] } } },
      },
      select: { id: true },
    })
    if (admins.length === 0) return 0

    const notifications = admins.flatMap((admin) =>
      low.map((item) => ({
        userId: admin.id,
        title: `Stok ${item.itemName} Menipis di ${item.warehouseName}`,
        body: `Stok di ${item.warehouseName}: ${item.qtyAtWarehouse} (Minimum: ${item.minStock}). Segera lakukan pembelian atau transfer antar gudang.`,
        type: 'warning' as const,
        readAt: null,
      })),
    )

    await prisma.notification.createMany({ data: notifications })
    return notifications.length
  },

  /**
   * Notify admins when an invoice is overdue (past due date, not fully paid).
   * Mirrors Laravel: NotificationService::notifyInvoiceAlmostDue
   */
  async notifyOverdueInvoice(invoice: OverdueInvoice): Promise<void> {
    const remaining = Number(invoice.grandTotal) - Number(invoice.paidAmount)
    const due = new Date(invoice.dueDate).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    })

    await this.notifyAdmins(
      `Invoice ${invoice.documentNo} Jatuh Tempo`,
      `Jatuh tempo: ${due}. Sisa: Rp ${remaining.toLocaleString('id-ID')}${invoice.customerName ? ` (${invoice.customerName})` : ''}`,
      'danger'
    )
  },

  /**
   * Notify admins when an employee checks in late.
   * Mirrors Laravel: NotificationService::notifyLateCheckIn
   */
  async notifyLateCheckIn(employee: LateCheckIn, checkInTime: string, scheduledTime?: string): Promise<void> {
    const dept = employee.departmentName ? ` (${employee.departmentName})` : ''

    await this.notifyAdmins(
      `${employee.name}${dept} Telat Masuk`,
      `Check-in: ${checkInTime}${scheduledTime ? ` (Jadwal: ${scheduledTime})` : ''}`,
      'warning'
    )
  },

  /**
   * Batched version of notifyLateCheckIn: send a separate "telat" notification
   * for each of N late employees to every active admin, in a single
   * `notification.createMany` round-trip. Replaces N × (admin findMany +
   * notification createMany) with 1 + 1 queries. Mirrors
   * `checkAndNotifyLowStockBatch` for low-stock alerts. The admin lookup is
   * done once; one createMany writes all N×A rows.
   */
  async notifyLateCheckInBatch(
    entries: { employee: LateCheckIn; checkInTime: string; scheduledTime?: string }[]
  ): Promise<number> {
    if (entries.length === 0) return 0
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { name: { in: ['super_admin', 'admin'] } } },
      },
      select: { id: true },
    })
    if (admins.length === 0) return 0

    const notifications = admins.flatMap((admin) =>
      entries.map((e) => {
        const dept = e.employee.departmentName ? ` (${e.employee.departmentName})` : ''
        return {
          userId: admin.id,
          title: `${e.employee.name}${dept} Telat Masuk`,
          body: `Check-in: ${e.checkInTime}${e.scheduledTime ? ` (Jadwal: ${e.scheduledTime})` : ''}`,
          type: 'warning' as const,
          readAt: null,
        }
      })
    )

    await prisma.notification.createMany({ data: notifications })
    return notifications.length
  },

  /**
   * Notify admins when a document is auto-generated from Down Payment confirmation.
   * Mirrors Laravel: document-ready notifications from DP observer.
   *
   * Thin wrapper around `notifyDocumentsReadyBatch` for the common single-doc
   * case. Callers that need to fire N ready-document notifications in one go
   * (e.g. `onDownPaymentConfirmed` pushes WorkOrder/SalesOrder/SalesInvoice)
   * should use `notifyDocumentsReadyBatch` directly to avoid the N+1 of
   * re-querying the admin list once per doc.
   */
  async notifyDocumentReady(
    type: DocumentType,
    documentNo: string,
    context?: string
  ): Promise<void> {
    await this.notifyDocumentsReadyBatch([{ type, documentNo, context }])
  },

  /**
   * Batched version: notify admins about N ready documents in one round-trip.
   * Replaces N×(admin findMany + notification createMany) with 1+1 queries.
   * Admin lookup is done once; one `createMany` writes all N×A rows. Mirrors
   * `checkAndNotifyLowStockBatch` and `notifyLateCheckInBatch`.
   */
  async notifyDocumentsReadyBatch(
    docs: { type: DocumentType; documentNo: string; context?: string }[]
  ): Promise<number> {
    if (docs.length === 0) return 0
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { name: { in: ['super_admin', 'admin'] } } },
      },
      select: { id: true },
    })
    if (admins.length === 0) return 0

    const labels: Record<DocumentType, string> = {
      WorkOrder: 'Work Order',
      SalesOrder: 'Sales Order',
      SalesInvoice: 'Invoice',
    }

    const notifications = admins.flatMap((admin) =>
      docs.map((d) => {
        const label = labels[d.type] ?? d.type
        const ctxSuffix = d.context ? ` ${d.context}` : ''
        return {
          userId: admin.id,
          title: `${label} Siap: ${d.documentNo}`,
          body: `${label} ${d.documentNo} telah dibuat otomatis.${ctxSuffix}`,
          type: 'info' as const,
          readAt: null,
        }
      })
    )

    await prisma.notification.createMany({ data: notifications })
    return notifications.length
  },

  /**
   * Mark a single notification as read.
   *
   * Security: requires a `userId` to scope the update. Without it, a caller
   * could pass another user's notification id and silently mutate it. The
   * `where: { id, userId }` shape makes the ownership check part of the
   * database operation itself — `updateMany` returns `count: 0` when the row
   * is missing OR not owned by the user (no distinction leaks existence),
   * avoiding the prior 2-step findFirst + update that doubled round-trips
   * and let `prisma.notification.update` run unguarded.
   */
  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const { count } = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    })
    return count > 0
  },

  /**
   * Mark all notifications for a user as read.
   */
  async markAllAsRead(userId: number): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
  },

  /**
   * Get unread notification count for a user.
   */
  async getUnreadCount(userId: number): Promise<number> {
    return await prisma.notification.count({
      where: { userId, readAt: null },
    })
  },
}
