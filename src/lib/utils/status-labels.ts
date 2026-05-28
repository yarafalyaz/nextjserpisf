// Centralized Indonesian status labels
// Keys = DB/internal values, Values = Indonesian display labels

export const STATUS_LABELS: Record<string, string> = {
  // General
  draft: "Konsep",
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  completed: "Selesai",
  active: "Aktif",
  inactive: "Nonaktif",

  // Manufacturing
  in_progress: "Dalam Proses",

  // Purchase
  sent: "Terkirim",
  verified: "Terverifikasi",
  paid: "Dibayar",
  partial: "Sebagian",

  // Delivery
  shipped: "Dikirim",
  delivered: "Terkirim",
  ordered: "Dipesan",
  cancelled: "Dibatalkan",
  returned: "Dikembalikan",
  in_transit: "Dalam Perjalanan",
  received: "Diterima",

  // Inventory
  processed: "Diproses",
  issued: "Dikeluarkan",

  // Sales
  confirmed: "Terkonfirmasi",
  posted: "Diposting",

  // CRM
  new: "Baru",
  open: "Terbuka",
  closed: "Tutup",
  won: "Menang",
  lost: "Kalah",
  converted: "Terkonversi",
  accepted: "Diterima",
  on_hold: "Ditunda",

  // HRM
  present: "Hadir",
  absent: "Tidak Hadir",
  late: "Terlambat",
  half_day: "Setengah Hari",
  sick: "Sakit",
  leave: "Cuti",
  overtime: "Lembur",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "-";
  return STATUS_LABELS[status] ?? status;
}
