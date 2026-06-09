/**
 * Type-safe status constants for all domains.
 * Use these instead of raw string literals throughout the codebase.
 * Maps to DB string columns — NOT Prisma enums (those are separate).
 */

// ─── General (shared across domains) ───────────────────────────────────────
export const Status = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type StatusValue = (typeof Status)[keyof typeof Status];

// ─── Sales ─────────────────────────────────────────────────────────────────
export const SalesStatus = {
  ...Status,
  SENT: "sent",
  ACCEPTED: "accepted",
  CONFIRMED: "confirmed",
  CONVERTED: "converted",
  POSTED: "posted",
  PAID: "paid",
  PARTIAL: "partial",
} as const;

export type SalesStatusValue = (typeof SalesStatus)[keyof typeof SalesStatus];

// ─── Purchase ──────────────────────────────────────────────────────────────
export const PurchaseStatus = {
  ...Status,
  ORDERED: "ordered",
  RECEIVED: "received",
  VERIFIED: "verified",
} as const;

export type PurchaseStatusValue = (typeof PurchaseStatus)[keyof typeof PurchaseStatus];

// ─── Manufacturing / Work Order ────────────────────────────────────────────
export const WorkOrderStatus = {
  DRAFT: "draft",
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type WorkOrderStatusValue = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

// ─── Inventory ─────────────────────────────────────────────────────────────
export const InventoryStatus = {
  DRAFT: "draft",
  PROCESSED: "processed",
  CANCELLED: "cancelled",
  ISSUED: "issued",
} as const;

export type InventoryStatusValue = (typeof InventoryStatus)[keyof typeof InventoryStatus];

// ─── Delivery ──────────────────────────────────────────────────────────────
export const DeliveryStatus = {
  DRAFT: "draft",
  SHIPPED: "shipped",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  RETURNED: "returned",
} as const;

export type DeliveryStatusValue = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

// ─── HRM / Attendance ──────────────────────────────────────────────────────
export const AttendanceStatus = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
  HALF_DAY: "half_day",
  SICK: "sick",
  LEAVE: "leave",
  OVERTIME: "overtime",
} as const;

export type AttendanceStatusValue = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

// ─── Leave / Approval ──────────────────────────────────────────────────────
export const ApprovalStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ApprovalStatusValue = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

// ─── Payment ───────────────────────────────────────────────────────────────
export const PaymentStatus = {
  UNPAID: "unpaid",
  PARTIAL: "partial",
  PAID: "paid",
} as const;

export type PaymentStatusValue = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// ─── CRM ───────────────────────────────────────────────────────────────────
export const CrmStatus = {
  NEW: "new",
  OPEN: "open",
  CONTACTED: "contacted",
  QUALIFIED: "qualified",
  PROPOSAL: "proposal",
  WON: "won",
  LOST: "lost",
  CONVERTED: "converted",
  ON_HOLD: "on_hold",
  CLOSED: "closed",
} as const;

export type CrmStatusValue = (typeof CrmStatus)[keyof typeof CrmStatus];

// ─── Bank Reconciliation ───────────────────────────────────────────────────
export const ReconciliationStatus = {
  UNMATCHED: "unmatched",
  MATCHED: "matched",
  RECONCILED: "reconciled",
} as const;

export type ReconciliationStatusValue = (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];
