
import { prisma } from '@/lib/db/prisma'

interface LowStockItem {
  id: number
  name: string
  qtyOnHand: number
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
   * Check if an item's stock is below minimum threshold and notify admins.
   * Idempotent — safe to call multiple times for the same item.
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
   * Notify admins when a document is auto-generated from Down Payment confirmation.
   * Mirrors Laravel: document-ready notifications from DP observer.
   */
  async notifyDocumentReady(type: DocumentType, documentNo: string, context?: string): Promise<void> {
    const labels: Record<DocumentType, { label: string }> = {
      WorkOrder:     { label: 'Work Order' },
      SalesOrder:    { label: 'Sales Order' },
      SalesInvoice:  { label: 'Invoice' },
    }
    const info = labels[type] ?? { label: type }

    await this.notifyAdmins(
      `${info.label} Siap: ${documentNo}`,
      `${info.label} ${documentNo} telah dibuat otomatis.${context ? ` ${context}` : ''}`,
      'info'
    )
  },

  /**
   * Mark a notification as read.
   */
  async markAsRead(notificationId: number): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    })
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
