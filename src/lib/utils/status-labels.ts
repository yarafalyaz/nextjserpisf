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
  resolved: "Terselesaikan",
  closed: "Tutup",
  won: "Menang",
  lost: "Kalah",
  converted: "Terkonversi",
  accepted: "Diterima",
  on_hold: "Ditunda",
  contacted: "Dihubungi",
  qualified: "Terkualifikasi",
  proposal: "Proposal",

  // HRM
  bonus: "Bonus",
  reward: "Penghargaan",
  incentive: "Insentif",
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

export const statusToIndo: Record<string, string> = {
  draft: "konsep",
  pending: "menunggu",
  approved: "disetujui",
  rejected: "ditolak",
  completed: "selesai",
  active: "aktif",
  inactive: "nonaktif",
  in_progress: "dalam-proses",
  sent: "terkirim",
  verified: "terverifikasi",
  paid: "dibayar",
  partial: "sebagian",
  shipped: "dikirim",
  delivered: "diterima",
  ordered: "dipesan",
  cancelled: "batal",
  returned: "retur",
  in_transit: "perjalanan",
  received: "diterima-gudang",
  processed: "diproses",
  issued: "keluar",
  confirmed: "konfirmasi",
  posted: "posting",
  new: "baru",
  open: "buka",
  resolved: "terselesaikan",
  closed: "tutup",
  won: "menang",
  lost: "kalah",
  converted: "konversi",
  accepted: "terima",
  on_hold: "tunda",
  contacted: "dihubungi",
  qualified: "kualifikasi",
  proposal: "proposal",
}

export const indoToStatus: Record<string, string> = Object.entries(statusToIndo).reduce(
  (acc, [db, url]) => {
    acc[url] = db
    return acc
  },
  {} as Record<string, string>
)
