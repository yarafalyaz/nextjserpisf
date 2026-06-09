import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyUsers: vi.fn(),
  createManyNotif: vi.fn(),
  createNotif: vi.fn(),
  updateNotif: vi.fn(),
  updateManyNotif: vi.fn(),
  countNotif: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findMany: mocks.findManyUsers },
    notification: {
      createMany: mocks.createManyNotif,
      create: mocks.createNotif,
      update: mocks.updateNotif,
      updateMany: mocks.updateManyNotif,
      count: mocks.countNotif,
    },
  },
}));

import { notificationService } from "@/lib/services/notification.service";

describe("notification.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("notifyAdmins", () => {
    it("creates notifications for all admin users", async () => {
      mocks.findManyUsers.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mocks.createManyNotif.mockResolvedValue({ count: 2 });

      await notificationService.notifyAdmins("Test Title", "Test Body", "warning");

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: [
          { userId: 1, title: "Test Title", body: "Test Body", type: "warning", readAt: null },
          { userId: 2, title: "Test Title", body: "Test Body", type: "warning", readAt: null },
        ],
      });
    });

    it("does nothing when no admins exist", async () => {
      mocks.findManyUsers.mockResolvedValue([]);

      await notificationService.notifyAdmins("Title", "Body");

      expect(mocks.createManyNotif).not.toHaveBeenCalled();
    });

    it("defaults type to info", async () => {
      mocks.findManyUsers.mockResolvedValue([{ id: 1 }]);
      mocks.createManyNotif.mockResolvedValue({ count: 1 });

      await notificationService.notifyAdmins("Title", "Body");

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: [{ userId: 1, title: "Title", body: "Body", type: "info", readAt: null }],
      });
    });
  });

  describe("notifyUser", () => {
    it("creates notification for specific user", async () => {
      mocks.createNotif.mockResolvedValue({ id: 1 });

      await notificationService.notifyUser(5, "Hello", "World", "success");

      expect(mocks.createNotif).toHaveBeenCalledWith({
        data: { userId: 5, title: "Hello", body: "World", type: "success" },
      });
    });
  });

  describe("notifyUsers", () => {
    it("creates notifications for multiple users", async () => {
      mocks.createManyNotif.mockResolvedValue({ count: 3 });

      await notificationService.notifyUsers([1, 2, 3], "Bulk", "Message");

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: [
          { userId: 1, title: "Bulk", body: "Message", type: "info", readAt: null },
          { userId: 2, title: "Bulk", body: "Message", type: "info", readAt: null },
          { userId: 3, title: "Bulk", body: "Message", type: "info", readAt: null },
        ],
      });
    });

    it("does nothing when userIds is empty", async () => {
      await notificationService.notifyUsers([], "Title", "Body");

      expect(mocks.createManyNotif).not.toHaveBeenCalled();
    });
  });

  describe("checkAndNotifyLowStock", () => {
    it("notifies when stock is below minimum", async () => {
      mocks.findManyUsers.mockResolvedValue([{ id: 1 }]);
      mocks.createManyNotif.mockResolvedValue({ count: 1 });

      await notificationService.checkAndNotifyLowStock({
        id: 10, name: "Oli Mesin", qtyOnHand: 3, minStock: 5,
      });

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ title: "Stok Oli Mesin Menipis", type: "warning" }),
        ]),
      });
    });

    it("does not notify when stock is above minimum", async () => {
      await notificationService.checkAndNotifyLowStock({
        id: 10, name: "Oli", qtyOnHand: 10, minStock: 5,
      });

      expect(mocks.findManyUsers).not.toHaveBeenCalled();
    });

    it("does not notify when minStock is 0", async () => {
      await notificationService.checkAndNotifyLowStock({
        id: 10, name: "Oli", qtyOnHand: 0, minStock: 0,
      });

      expect(mocks.findManyUsers).not.toHaveBeenCalled();
    });
  });

  describe("notifyOverdueInvoice", () => {
    it("notifies with correct formatted message", async () => {
      mocks.findManyUsers.mockResolvedValue([{ id: 1 }]);
      mocks.createManyNotif.mockResolvedValue({ count: 1 });

      await notificationService.notifyOverdueInvoice({
        id: 1, documentNo: "INV-2026-001", customerName: "PT ABC",
        dueDate: new Date("2026-06-01"), grandTotal: 5000000, paidAmount: 2000000,
      });

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            title: "Invoice INV-2026-001 Jatuh Tempo",
            type: "danger",
          }),
        ]),
      });
    });
  });

  describe("notifyLateCheckIn", () => {
    it("notifies with department and scheduled time", async () => {
      mocks.findManyUsers.mockResolvedValue([{ id: 1 }]);
      mocks.createManyNotif.mockResolvedValue({ count: 1 });

      await notificationService.notifyLateCheckIn(
        { id: 5, name: "Budi", departmentName: "Bengkel" },
        "08:15",
        "08:00"
      );

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            title: "Budi (Bengkel) Telat Masuk",
            body: "Check-in: 08:15 (Jadwal: 08:00)",
            type: "warning",
          }),
        ]),
      });
    });

    it("notifies without department and scheduled time", async () => {
      mocks.findManyUsers.mockResolvedValue([{ id: 1 }]);
      mocks.createManyNotif.mockResolvedValue({ count: 1 });

      await notificationService.notifyLateCheckIn({ id: 5, name: "Andi" }, "09:00");

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            title: "Andi Telat Masuk",
            body: "Check-in: 09:00",
            type: "warning",
          }),
        ]),
      });
    });
  });

  describe("notifyDocumentReady", () => {
    it("notifies with WorkOrder label", async () => {
      mocks.findManyUsers.mockResolvedValue([{ id: 1 }]);
      mocks.createManyNotif.mockResolvedValue({ count: 1 });

      await notificationService.notifyDocumentReady("WorkOrder", "WO-001", "Dari DP-001");

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            title: "Work Order Siap: WO-001",
            body: "Work Order WO-001 telah dibuat otomatis. Dari DP-001",
          }),
        ]),
      });
    });

    it("works without context", async () => {
      mocks.findManyUsers.mockResolvedValue([{ id: 1 }]);
      mocks.createManyNotif.mockResolvedValue({ count: 1 });

      await notificationService.notifyDocumentReady("SalesInvoice", "INV-001");

      expect(mocks.createManyNotif).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            title: "Invoice Siap: INV-001",
            body: "Invoice INV-001 telah dibuat otomatis.",
          }),
        ]),
      });
    });
  });

  describe("markAsRead", () => {
    it("updates notification readAt", async () => {
      mocks.updateNotif.mockResolvedValue({ id: 5 });

      await notificationService.markAsRead(5);

      expect(mocks.updateNotif).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe("markAllAsRead", () => {
    it("updates all unread notifications for user", async () => {
      mocks.updateManyNotif.mockResolvedValue({ count: 3 });

      await notificationService.markAllAsRead(42);

      expect(mocks.updateManyNotif).toHaveBeenCalledWith({
        where: { userId: 42, readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe("getUnreadCount", () => {
    it("returns count of unread notifications", async () => {
      mocks.countNotif.mockResolvedValue(7);

      const result = await notificationService.getUnreadCount(42);

      expect(result).toBe(7);
      expect(mocks.countNotif).toHaveBeenCalledWith({
        where: { userId: 42, readAt: null },
      });
    });
  });
});
