/**
 * Klaim atomik status dokumen untuk jalur persetujuan generik.
 *
 * Satu sumber kebenaran, dipakai dua penulis:
 * - `approveStep`/`rejectStep` (approval.actions) memakai `from` sebagai
 *   predikat `updateMany` — count 0 = dokumen sudah terminal, tolak tanpa
 *   resurrect/flip ulang.
 * - Route `/api/workflow/[...path]` memakainya SEBELUM
 *   `requestApprovalIfConfigured` (putaran 105). Tanpa cek itu, klik
 *   Setujui pada dokumen yang sudah lewat draft (faktur posted, PO
 *   cancelled) melahirkan baris `Approval` pending yang commit lebih dulu,
 *   lalu klaim langkahnya gagal dan rollback — menyisakan approval yatim
 *   yang mengotori antrean dan memblokir edit/hapus konfigurasi workflow
 *   selamanya (`pendingCount > 0`).
 *
 * Dokumen berstatus `rejected` sengaja TIDAK ditolak di sini: route
 * membuka ulang (reset ke draft/pending + approval baru) sebelum memproses
 * langkah, jadi pre-state-nya dipulihkan lebih dulu.
 *
 * Tipe gate-only (Journal, VendorPayment, StockAdjustment, Asset, Project,
 * YearEndClosing) tidak ada di peta ini: approval-nya menggerbang posting,
 * bukan memindahkan status dokumen, jadi dokumennya tetap sah diajukan.
 */
export interface ApprovalClaim {
  from: string[]
  error: string
}

export const APPROVE_CLAIMS: Record<string, ApprovalClaim> = {
  Payroll: { from: ["draft"], error: "Slip gaji hanya dapat disetujui dari status draft." },
  LeaveRequest: { from: ["pending"], error: "Pengajuan cuti hanya dapat disetujui dari status menunggu." },
  OvertimeRequest: { from: ["pending"], error: "Pengajuan lembur hanya dapat disetujui dari status menunggu." },
  EmployeeLoan: { from: ["pending"], error: "Pinjaman hanya dapat disetujui dari status menunggu." },
  // Dokumen dagang lahir draft; approval pending selalu berpasangan draft
  // (reopen mereset rejected->draft sebelum pengajuan baru). Dokumen yang
  // sudah melampaui draft (posted/cancelled/converted/dibayar) tidak boleh
  // di-flip ulang oleh approval yang tertinggal — flip polos sebelumnya
  // menghidupkan kembali PO yang sudah dibatalkan.
  PurchaseRequest: { from: ["draft"], error: "Permintaan pembelian hanya dapat disetujui dari status draft." },
  PurchaseOrder: { from: ["draft"], error: "Pesanan pembelian hanya dapat disetujui dari status draft." },
  VendorBill: { from: ["draft"], error: "Tagihan vendor hanya dapat disetujui dari status draft." },
  SalesOrder: { from: ["draft"], error: "Pesanan penjualan hanya dapat disetujui dari status draft." },
  SalesInvoice: { from: ["draft"], error: "Faktur penjualan hanya dapat disetujui dari status draft." },
  Expense: { from: ["draft"], error: "Pengeluaran hanya dapat disetujui dari status draft." },
  // Pengajuan Quotation lahir saat status sent; reopen lahir saat draft.
  Quotation: { from: ["draft", "sent"], error: "Penawaran hanya dapat disetujui dari status draft atau terkirim." },
}

export const REJECT_CLAIMS: Record<string, ApprovalClaim> = {
  Payroll: { from: ["draft", "approved"], error: "Slip gaji hanya dapat ditolak dari status draft atau approved." },
  LeaveRequest: { from: ["pending"], error: "Pengajuan cuti hanya dapat ditolak dari status menunggu." },
  OvertimeRequest: { from: ["pending"], error: "Pengajuan lembur hanya dapat ditolak dari status menunggu." },
  EmployeeLoan: { from: ["pending"], error: "Pinjaman hanya dapat ditolak dari status menunggu." },
  PurchaseRequest: { from: ["draft"], error: "Permintaan pembelian hanya dapat ditolak dari status draft." },
  PurchaseOrder: { from: ["draft"], error: "Pesanan pembelian hanya dapat ditolak dari status draft." },
  VendorBill: { from: ["draft"], error: "Tagihan vendor hanya dapat ditolak dari status draft." },
  SalesOrder: { from: ["draft"], error: "Pesanan penjualan hanya dapat ditolak dari status draft." },
  SalesInvoice: { from: ["draft"], error: "Faktur penjualan hanya dapat ditolak dari status draft." },
  Expense: { from: ["draft"], error: "Pengeluaran hanya dapat ditolak dari status draft." },
  Quotation: { from: ["draft", "sent"], error: "Penawaran hanya dapat ditolak dari status draft atau terkirim." },
}
