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

// ─── Purchase ──────────────────────────────────────────────────────────────
export const PurchaseStatus = {
  ...Status,
  ORDERED: "ordered",
  RECEIVED: "received",
  VERIFIED: "verified",
} as const;

// ─── Manufacturing / Work Order ────────────────────────────────────────────
export const WorkOrderStatus = {
  DRAFT: "draft",
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

// ─── Inventory ─────────────────────────────────────────────────────────────
export const InventoryStatus = {
  DRAFT: "draft",
  PROCESSED: "processed",
  CANCELLED: "cancelled",
  ISSUED: "issued",
} as const;

// ─── Delivery ──────────────────────────────────────────────────────────────
export const DeliveryStatus = {
  DRAFT: "draft",
  SHIPPED: "shipped",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  RETURNED: "returned",
} as const;

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

// ─── Leave / Approval ──────────────────────────────────────────────────────
export const ApprovalStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

// ─── Payment ───────────────────────────────────────────────────────────────
export const PaymentStatus = {
  UNPAID: "unpaid",
  PARTIAL: "partial",
  PAID: "paid",
} as const;

// ─── Document-linkable statuses ────────────────────────────────────────────
// Satu sumber untuk pasangan "picker menawarkan apa" vs "action menerima apa".
// Sebelum ini setiap pasangan ditulis dua kali — sekali sebagai `where` di
// halaman form, sekali sebagai `if (... !== "...")` di action — dan keduanya
// menyimpang: halaman ubah pembayaran menawarkan faktur draft/approved/
// cancelled yang selalu ditolak, halaman ubah transfer aset menawarkan aset
// non-aktif, halaman ubah pembayaran pemasok menawarkan tagihan konsep, dan
// halaman ubah penerimaan menawarkan PO `received`. Impor konstanta ini di
// KEDUA sisi supaya penyimpangan berikutnya tidak bisa ditulis.

/** Work order yang sudah final — tidak boleh menerima turunan baru. */
export const TERMINAL_WORK_ORDER_STATUSES = ["completed", "cancelled", "closed"] as const;

/** Aset yang boleh dipindahkan (transfer/penempatan). */
export const TRANSFERABLE_ASSET_STATUSES = ["active"] as const;

/** PO yang boleh melahirkan/menerima penerimaan barang. */
export const RECEIVABLE_PURCHASE_ORDER_STATUSES = [
  "approved",
  "ordered",
  "partial_received",
] as const;

/** Tagihan yang boleh dibayar (sudah dikonfirmasi/diposting). */
export const PAYABLE_VENDOR_BILL_STATUSES = ["posted", "partial"] as const;

/**
 * Faktur penjualan yang boleh ditautkan saat MENGUBAH pembayaran.
 * Sengaja bukan allowlist `posted`/`partial` seperti pembuatan: pembayaran yang
 * sudah melunasi fakturnya meninggalkan faktur di `paid`, jadi allowlist itu
 * akan memblokir kasus normal mengoreksi nominal/tanggal. `sent` dibiarkan
 * karena action mengizinkannya; yang dilarang hanya yang belum pernah
 * diposting (`draft`, `approved`) dan yang sudah dibatalkan (`cancelled`).
 */
export const UNPAYABLE_SALES_INVOICE_STATUSES = ["draft", "approved", "cancelled"] as const;

// ─── Dokumen yang hanya boleh diubah/dihapus saat masih draft ──────────────
// Sama seperti kelompok di atas: halaman detail dan action-nya harus membaca
// satu definisi. Halaman detail yang menampilkan Ubah/Hapus tanpa melihat
// status membuat operator mengklik tombol yang server-nya pasti tolak — dan
// untuk dokumen yang sudah memposting jurnal/stok, "Ubah" pada dokumen posted
// tampak seperti koreksi yang sah padahal jalur koreksinya adalah void/retur.

/** Dokumen yang siklus edit/hapus-nya berhenti begitu keluar dari draft. */
export const DRAFT_ONLY_EDIT_STATUSES = ["draft"] as const;

/** Dokumen yang boleh diubah selama masih konsep ATAU menunggu persetujuan. */
export const DRAFT_OR_PENDING_EDIT_STATUSES = ["draft", "pending"] as const;

/** Pengajuan HR (cuti/lembur/pinjaman) — hanya bisa diedit selama menunggu. */
export const PENDING_ONLY_EDIT_STATUSES = ["pending"] as const;

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

// ─── Bank Reconciliation ───────────────────────────────────────────────────
export const ReconciliationStatus = {
  UNMATCHED: "unmatched",
  MATCHED: "matched",
  RECONCILED: "reconciled",
} as const;

// ─── Shared discount semantics ─────────────────────────────────────────
// dipakai di form.schemas.ts + sales.schemas.ts (dua tempat) supaya enum-nya
// tidak duplikat dan drift (fixed/percent vs amount/percent). Single source of
// truth; validasi client & server pakai nilai yang sama.
export const DISCOUNT_TYPES = ["fixed", "percent"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

