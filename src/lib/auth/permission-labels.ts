/**
 * Indonesian display labels for the permission catalogue.
 *
 * A permission row stores a machine key (`create_purchase_orders`). The role
 * forms render one checkbox per key, so without a translation the UI shows the
 * raw key to the user. Labels are derived from the key's two parts — verb +
 * subject — rather than from a 292-entry lookup table, so a permission only
 * needs a dictionary entry when it introduces a new verb or a new subject.
 *
 * `permissionLabel` falls back to the raw key, so an unmapped permission stays
 * visible in the UI instead of rendering blank; the coverage test in
 * `__tests__/permission-labels.test.ts` fails when `PERMISSIONS` grows past the
 * dictionary.
 */

/** Leading token of a permission key → Indonesian verb. */
export const PERMISSION_VERBS: Record<string, string> = {
  view: "Lihat",
  create: "Tambah",
  edit: "Ubah",
  update: "Ubah",
  delete: "Hapus",
  manage: "Kelola",
  approve: "Setujui",
  confirm: "Konfirmasi",
  verify: "Verifikasi",
  post: "Posting",
  process: "Proses",
  complete: "Selesaikan",
};

/** Remaining tokens of a permission key → Indonesian subject. */
export const PERMISSION_SUBJECTS: Record<string, string> = {
  accounts: "Akun",
  appreciations: "Apresiasi",
  recruitments: "Rekrutmen",
  salary_amounts: "Nominal Gaji",
  salary_adjustments: "Penyesuaian Gaji",
  performance: "Penilaian Kinerja",
  competencies: "Kompetensi",
  trainings: "Pelatihan",
  succession: "Perencanaan Suksesi",
  asset_brands: "Merek Aset",
  asset_groups: "Grup Aset",
  asset_categories: "Kategori Aset",
  asset_transfers: "Transfer Aset",
  assets: "Aset",
  attendance: "Absensi",
  bank_reconciliation: "Rekonsiliasi Bank",
  bank_statements: "Rekening Koran",
  bank_transfers: "Transfer Bank",
  banks: "Bank",
  barcodes: "Barcode",
  bom_revisions: "Revisi BOM",
  cheques: "Giro & Cek",
  brands: "Merek",
  calendar: "Kalender",
  cost_centers: "Pusat Biaya",
  profit_centers: "Pusat Laba",
  currencies: "Mata Uang",
  customers: "Pelanggan",
  credit_overrides: "Pengecualian Kredit",
  dashboard: "Dasbor",
  delivery_orders: "Surat Jalan",
  departments: "Departemen",
  disciplinary_records: "Rekod Disiplin SP",
  down_payments: "Uang Muka",
  employee_loans: "Pinjaman Karyawan",
  employee_loan_requests: "Pengajuan Pinjaman Karyawan",
  employee_reimbursements: "Klaim Reimbursement",
  employees: "Karyawan",
  salary_amounts: "Nominal Gaji",
  cost_amounts: "Nilai HPP/Biaya",
  sensitive_identity: "Identitas Sensitif Karyawan",
  subordinate_data: "Data Bawahan",
  expense_categories: "Kategori Biaya",
  favorite_transactions: "Transaksi Favorit",
  expenses: "Biaya",
  goods_receipts: "Penerimaan Barang",
  holidays: "Hari Libur",
  inventory: "Inventaris",
  inventory_transfers: "Transfer Stok",
  material_requests: "Permintaan Antar Gudang",
  item_categories: "Kategori Barang",
  item_groups: "Grup Barang",
  items: "Barang",
  journals: "Jurnal",
  leads: "Prospek",
  contracts: "Kontrak Karyawan",
  leave_requests: "Pengajuan Cuti",
  loans: "Pinjaman",
  attendance_corrections: "Koreksi Absensi",
  material_issues: "Pengeluaran Material",
  nonconformances: "NCR",
  overtime: "Lembur",
  overtime_requests: "Pengajuan Lembur",
  payment_methods: "Metode Pembayaran",
  payment_terms: "Termin Pembayaran",
  payroll: "Penggajian",
  payroll_reports: "Laporan Gaji",
  petty_cash: "Kas Kecil",
  positions: "Jabatan",
  production: "Produksi",
  production_costs: "Biaya Produksi",
  production_orders: "Perintah Produksi",
  products: "Produk",
  projects: "Proyek",
  purchase_advances: "Uang Muka Pembelian",
  purchase_orders: "Pesanan Pembelian",
  vendor_prices: "Harga Pemasok",
  tax_payments: "Penyetoran Pajak",
  tax_invoices: "Faktur Pajak",
  purchase_requests: "Permintaan Pembelian",
  purchase_returns: "Retur Pembelian",
  racks: "Rak",
  qc: "Pengendalian Mutu",
  qc_checklists: "Checklist QC",
  qc_inspections: "Inspeksi QC",
  quotations: "Penawaran",
  customer_price_lists: "Daftar Harga Pelanggan",
  recurring_transactions: "Transaksi Berulang",
  reports: "Laporan",
  roles: "Peran",
  sales_invoices: "Faktur Penjualan",
  sales_orders: "Pesanan Penjualan",
  sales_payments: "Pembayaran Penjualan",
  invoice_exchanges: "Tukar Faktur",
  invoice_collection_followups: "Tindak Lanjut Penagihan",
  sales_late_fees: "Dokumen Denda Piutang",
  sales_returns: "Retur Penjualan",
  settings: "Pengaturan",
  shipping_methods: "Metode Pengiriman",
  statistical_key_figures: "Angka Kunci Statistik",
  stock_adjustments: "Penyesuaian Stok",
  stock_opname: "Stok Opname",
  stock_moves: "Mutasi Stok",
  tax_groups: "Grup Pajak",
  taxes: "Pajak",
  tickets: "Tiket",
  timesheets: "Timesheet",
  units: "Satuan",
  users: "Pengguna",
  vehicle_brands: "Merek Kendaraan",
  vehicle_fitments: "Fitment Kendaraan",
  vehicle_models: "Model Kendaraan",
  vehicles: "Kendaraan",
  vendor_bills: "Tagihan Vendor",
  vendor_payments: "Pembayaran Vendor",
  vendors: "Vendor",
  warehouses: "Gudang",
  withholding_tax: "Pajak Potong",
  withholding_certificates: "Bukti Potong",
  work_orders: "Perintah Kerja",
  warranty_claims: "Klaim Garansi",
  work_schedules: "Jadwal Kerja",
  workflows: "Alur Kerja",
};

/** Split `create_purchase_orders` into its verb and subject parts. */
function splitPermission(name: string): { verb: string; subject: string } {
  const separator = name.indexOf("_");
  if (separator === -1) return { verb: name, subject: "" };
  return { verb: name.slice(0, separator), subject: name.slice(separator + 1) };
}

/** Indonesian label for a permission key, e.g. `edit_items` → `Ubah Barang`. */
export function permissionLabel(name: string): string {
  const { verb, subject } = splitPermission(name);
  const verbLabel = PERMISSION_VERBS[verb];
  const subjectLabel = PERMISSION_SUBJECTS[subject];
  if (!verbLabel || !subjectLabel) return name;
  return `${verbLabel} ${subjectLabel}`;
}

/** Indonesian heading for a permission group, e.g. `approve` → `Setujui`. */
export function permissionGroupLabel(verb: string): string {
  return PERMISSION_VERBS[verb] ?? verb;
}
