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

  // Sales
  confirmed: "Terkonfirmasi",
  delivered: "Terkirim",
  posted: "Diposting",

  // Inventory
  processed: "Diproses",
  issued: "Dikeluarkan",
  in_transit: "Dalam Perjalanan",
  received: "Diterima",

  // CRM
  new: "Baru",
  open: "Terbuka",
  closed: "Tutup",
  won: "Menang",
  lost: "Kalah",

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
