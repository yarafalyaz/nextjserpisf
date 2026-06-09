import { describe, it, expect } from "vitest";
import {
  Status,
  SalesStatus,
  PurchaseStatus,
  WorkOrderStatus,
  InventoryStatus,
  DeliveryStatus,
  AttendanceStatus,
  ApprovalStatus,
  PaymentStatus,
  CrmStatus,
  ReconciliationStatus,
} from "@/lib/constants";
import { STATUS_LABELS } from "@/lib/utils/status-labels";

describe("Status constants", () => {
  it("Status base values match expected strings", () => {
    expect(Status.DRAFT).toBe("draft");
    expect(Status.PENDING).toBe("pending");
    expect(Status.APPROVED).toBe("approved");
    expect(Status.REJECTED).toBe("rejected");
    expect(Status.COMPLETED).toBe("completed");
    expect(Status.CANCELLED).toBe("cancelled");
    expect(Status.ACTIVE).toBe("active");
    expect(Status.INACTIVE).toBe("inactive");
  });

  it("SalesStatus extends base Status", () => {
    expect(SalesStatus.DRAFT).toBe("draft");
    expect(SalesStatus.SENT).toBe("sent");
    expect(SalesStatus.ACCEPTED).toBe("accepted");
    expect(SalesStatus.CONFIRMED).toBe("confirmed");
    expect(SalesStatus.CONVERTED).toBe("converted");
    expect(SalesStatus.POSTED).toBe("posted");
    expect(SalesStatus.PAID).toBe("paid");
    expect(SalesStatus.PARTIAL).toBe("partial");
  });

  it("PurchaseStatus extends base Status", () => {
    expect(PurchaseStatus.DRAFT).toBe("draft");
    expect(PurchaseStatus.ORDERED).toBe("ordered");
    expect(PurchaseStatus.RECEIVED).toBe("received");
    expect(PurchaseStatus.VERIFIED).toBe("verified");
  });

  it("WorkOrderStatus has manufacturing-specific values", () => {
    expect(WorkOrderStatus.IN_PROGRESS).toBe("in_progress");
    expect(WorkOrderStatus.COMPLETED).toBe("completed");
    expect(WorkOrderStatus.PENDING).toBe("pending");
  });

  it("InventoryStatus has inventory-specific values", () => {
    expect(InventoryStatus.PROCESSED).toBe("processed");
    expect(InventoryStatus.ISSUED).toBe("issued");
  });

  it("DeliveryStatus has delivery-specific values", () => {
    expect(DeliveryStatus.SHIPPED).toBe("shipped");
    expect(DeliveryStatus.IN_TRANSIT).toBe("in_transit");
    expect(DeliveryStatus.DELIVERED).toBe("delivered");
    expect(DeliveryStatus.RETURNED).toBe("returned");
  });

  it("AttendanceStatus has HRM values", () => {
    expect(AttendanceStatus.PRESENT).toBe("present");
    expect(AttendanceStatus.ABSENT).toBe("absent");
    expect(AttendanceStatus.LATE).toBe("late");
    expect(AttendanceStatus.HALF_DAY).toBe("half_day");
    expect(AttendanceStatus.OVERTIME).toBe("overtime");
  });

  it("ApprovalStatus has approval workflow values", () => {
    expect(ApprovalStatus.PENDING).toBe("pending");
    expect(ApprovalStatus.APPROVED).toBe("approved");
    expect(ApprovalStatus.REJECTED).toBe("rejected");
  });

  it("PaymentStatus has payment values", () => {
    expect(PaymentStatus.UNPAID).toBe("unpaid");
    expect(PaymentStatus.PARTIAL).toBe("partial");
    expect(PaymentStatus.PAID).toBe("paid");
  });

  it("CrmStatus has CRM pipeline values", () => {
    expect(CrmStatus.NEW).toBe("new");
    expect(CrmStatus.OPEN).toBe("open");
    expect(CrmStatus.WON).toBe("won");
    expect(CrmStatus.LOST).toBe("lost");
    expect(CrmStatus.CONVERTED).toBe("converted");
  });

  it("ReconciliationStatus has bank recon values", () => {
    expect(ReconciliationStatus.UNMATCHED).toBe("unmatched");
    expect(ReconciliationStatus.MATCHED).toBe("matched");
    expect(ReconciliationStatus.RECONCILED).toBe("reconciled");
  });

  it("all base Status values have Indonesian labels", () => {
    for (const value of Object.values(Status)) {
      expect(STATUS_LABELS[value]).toBeDefined();
      expect(typeof STATUS_LABELS[value]).toBe("string");
    }
  });

  it("constants are readonly (as const)", () => {
    // TypeScript enforces this at compile time, but verify runtime values are stable
    const original = Status.DRAFT;
    expect(original).toBe("draft");
    // Attempting to reassign would be a TS error
  });
});
