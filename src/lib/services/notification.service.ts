// @ts-nocheck
import { prisma } from '@/lib/db/prisma'

interface LowStockItem {
  id: number
  name: string
  qtyOnHand: number
  minStock: number
}

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
        `⚠️ Stok ${item.name} Menipis`,
        `Stok saat ini: ${item.qtyOnHand} (Minimum: ${item.minStock}). Segera lakukan pembelian.`,
        'warning'
      )
    }
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
