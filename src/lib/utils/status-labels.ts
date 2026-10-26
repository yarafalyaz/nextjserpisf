// Centralized Indonesian labels for DB/internal values
// Keys = DB/internal values, Values = Indonesian display labels

export const STATUS_LABELS: Record<string, string> = {
  // General
  draft: "Konsep",
  pending: "Menunggu",
  pending_approval: "Menunggu Persetujuan",
  released: "Dirilis",
  superseded: "Digantikan",
  approved: "Disetujui",
  rejected: "Ditolak",
  completed: "Selesai",
  // F-2026-10-22-068-S: status pengajuan ganti revisi BOM (backend PR #589)
  menunggu: "Menunggu",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  diterapkan_langsung: "Diterapkan Langsung",
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
  replaced: "Diganti",
  in_transit: "Dalam Perjalanan",
  received: "Diterima",
  partially_received: "Diterima Sebagian",

  // Inventory
  processed: "Diproses",
  issued: "Dikeluarkan",
  IN: "Masuk",
  OUT: "Keluar",

  // Sales
  confirmed: "Terkonfirmasi",
  posted: "Diposting",
  reversed: "Dibalik",
  reversing: "Sedang Dibalik",

  // Subledger komisi per penerima (F-2026-10-25-049-S, status turunan server 049-V §3)
  ACCRUED: "Terakru",
  PARTIALLY_PAID: "Terbayar Sebagian",
  PAID: "Lunas Terbayar",
  REVERSED: "Dibalik Penuh",
  OVERPAID_NEGATIVE: "Kelebihan Bayar (Saldo Negatif)",

  // Garansi (F-2026-10-21-021)
  intake: "Masuk",
  eligibility: "Penilaian",
  in_repair: "Dalam Perbaikan",
  expired: "Kedaluwarsa",
  revoked: "Dicabut",

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

  // Additional
  skipped: "Dilewati",
  overdue: "Terlambat",
  running: "Berjalan",
  planned: "Direncanakan",

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

/** Label a value from any of the maps below; unknown values stay visible. */
export function labelFrom(
  labels: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return "-"
  return labels[value] ?? labels[value.toLowerCase()] ?? value
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "-"
  return STATUS_LABELS[status] ?? STATUS_LABELS[status.toLowerCase()] ?? status
}

/** `LeaveRequest.type` → label Indonesia (juga sumber opsi di formulir cuti). */
export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Cuti Tahunan",
  sick: "Sakit",
  personal: "Keperluan Pribadi",
  maternity: "Cuti Melahirkan",
  unpaid: "Tanpa Gaji",
  marriage: "Menikah",
  child_marriage: "Menikahkan Anak",
  child_circumcision: "Mengkhitankan Anak",
  child_baptism: "Membaptis Anak",
  spouse_childbirth: "Istri Melahirkan/Keguguran",
  family_death_core: "Keluarga Inti Meninggal",
  family_death_household: "Keluarga Serumah Meninggal",
  menstrual: "Cuti Haid",
  pilgrimage: "Ibadah Haji",
};

/** `AssetHistory.type` → label Indonesia. */
export const ASSET_HISTORY_TYPE_LABELS: Record<string, string> = {
  depreciation: "Penyusutan",
  disposal: "Pelepasan",
};

/** `LeadActivity.type` → label Indonesia. */
export const LEAD_ACTIVITY_TYPE_LABELS: Record<string, string> = {
  note: "Catatan",
  call: "Telepon",
  email: "Surel",
  meeting: "Rapat",
  task: "Tugas",
  status_change: "Perubahan Status",
  conversion: "Konversi",
};

/** Jenis aktivitas prospek yang bisa dipilih pengguna (form input). */
export const LEAD_ACTIVITY_TYPE_OPTIONS = ["note", "call", "email", "meeting", "task"] as const;

/** `Nonconformance.severity` → label Indonesia. */
export const SEVERITY_LABELS: Record<string, string> = {
  minor: "Ringan",
  major: "Sedang",
  critical: "Kritis",
};

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
  reversed: "dibalik",
  reversing: "sedang-dibalik",
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
