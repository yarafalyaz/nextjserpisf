/**
 * Menghasilkan `src/lib/auth/module-catalog.generated.ts` — katalog lengkap semua
 * permission (dari `src/lib/setup/base-data.ts`) yang dikelompokkan per modul untuk
 * matriks izin di Pengaturan → Peran.
 *
 * Kenapa di-generate: 301 permission harus terpetakan SEMUANYA, dan menulisnya manual
 * membuat katalog mudah drift dari `PERMISSIONS` (dulu hanya 80 dari 301 yang terpetakan).
 *
 * Jalankan: node scripts/generate-module-catalog.mjs
 * Setelah menambah permission baru: tambahkan ke `PERMISSIONS`, jalankan skrip ini,
 * lalu `npm run db:seed`.
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const BASE_DATA = path.join(ROOT, "src/lib/setup/base-data.ts")
const OUT = path.join(ROOT, "src/lib/auth/module-catalog.generated.ts")

/** Verba aksi yang dikenal = kolom matriks. Urutan ini juga urutan kolom. */
const VERBS = [
  "view",
  "create",
  "edit",
  "update",
  "delete",
  "manage",
  "approve",
  "confirm",
  "post",
  "verify",
  "process",
  "complete",
]

/** Urutan modul mengikuti sidebar (sama dengan order di modules.ts). */
const MODULE_ORDER = [
  "dashboard",
  "master",
  "sales",
  "purchase",
  "inventory",
  "manufacturing",
  "hrm",
  "finance",
  "crm",
  "vehicles",
  "projects",
  "assets",
  "reports",
  "calendar",
  "settings",
]

/** Entitas (baris matriks) → modul pemiliknya. */
const RESOURCE_MODULE = {
  // Dasbor
  dashboard: "dashboard",
  calendar: "calendar",
  // Data Master
  customers: "master",
  vendors: "master",
  items: "master",
  item_categories: "master",
  item_groups: "master",
  brands: "master",
  barcodes: "master",
  currencies: "master",
  warehouses: "master",
  employees: "master",
  departments: "master",
  positions: "master",
  accounts: "master",
  banks: "master",
  taxes: "master",
  tax_groups: "master",
  payment_terms: "master",
  payment_methods: "master",
  shipping_methods: "master",
  units: "master",
  expense_categories: "master",
  // Penjualan
  quotations: "sales",
  down_payments: "sales",
  sales_orders: "sales",
  delivery_orders: "sales",
  sales_invoices: "sales",
  sales_payments: "sales",
  sales_returns: "sales",
  invoice_exchanges: "sales",
  // Pembelian
  purchase_requests: "purchase",
  purchase_advances: "purchase",
  vendor_prices: "purchase",
  purchase_orders: "purchase",
  goods_receipts: "purchase",
  vendor_bills: "purchase",
  vendor_payments: "purchase",
  tax_payments: "finance",
  purchase_returns: "purchase",
  // Inventaris
  inventory: "inventory",
  stock_moves: "inventory",
  racks: "inventory",
  stock_opname: "inventory",
  stock_adjustments: "inventory",
  inventory_transfers: "inventory",
  material_issues: "inventory",
  // Manufaktur
  production: "manufacturing",
  production_orders: "manufacturing",
  products: "manufacturing",
  work_orders: "manufacturing",
  bom_revisions: "manufacturing",
  qc: "manufacturing",
  qc_checklists: "manufacturing",
  qc_inspections: "manufacturing",
  nonconformances: "manufacturing",
  production_costs: "manufacturing",
  // SDM
  attendance: "hrm",
  work_schedules: "hrm",
  leave_requests: "hrm",
  overtime: "hrm",
  overtime_requests: "hrm",
  payroll: "hrm",
  timesheets: "hrm",
  holidays: "hrm",
  employee_loans: "hrm",
  loans: "hrm",
  appreciations: "hrm",
  // Keuangan
  journals: "finance",
  expenses: "finance",
  petty_cash: "finance",
  cost_centers: "finance",
  profit_centers: "finance",
  bank_statements: "finance",
  bank_reconciliation: "finance",
  bank_transfers: "finance",
  cheques: "finance",
  withholding_tax: "finance",
  // CRM
  leads: "crm",
  tickets: "crm",
  // Kendaraan
  vehicles: "vehicles",
  vehicle_brands: "vehicles",
  vehicle_models: "vehicles",
  vehicle_fitments: "vehicles",
  // Proyek
  projects: "projects",
  // Aset
  assets: "assets",
  asset_brands: "assets",
  asset_categories: "assets",
  asset_transfers: "assets",
  // Laporan
  reports: "reports",
  // Administrasi sistem
  settings: "settings",
  users: "settings",
  roles: "settings",
  workflows: "settings",
  recurring_transactions: "settings",
  favorite_transactions: "settings",
}

/** Label entitas untuk UI (baris matriks). */
const RESOURCE_LABEL = {
  dashboard: "Dasbor",
  calendar: "Kalender",
  customers: "Pelanggan",
  vendors: "Vendor",
  items: "Barang",
  item_categories: "Kategori Barang",
  item_groups: "Grup Barang",
  brands: "Merek",
  barcodes: "Barcode",
  currencies: "Mata Uang",
  warehouses: "Gudang",
  employees: "Karyawan",
  departments: "Departemen",
  positions: "Jabatan",
  accounts: "Akun (COA)",
  banks: "Bank",
  taxes: "Pajak",
  tax_groups: "Grup Pajak",
  payment_terms: "Termin Pembayaran",
  payment_methods: "Metode Pembayaran",
  shipping_methods: "Metode Pengiriman",
  units: "Satuan",
  expense_categories: "Kategori Beban",
  quotations: "Penawaran",
  down_payments: "Uang Muka",
  sales_orders: "Pesanan Penjualan",
  delivery_orders: "Surat Jalan",
  sales_invoices: "Faktur Penjualan",
  sales_payments: "Pembayaran Penjualan",
  sales_returns: "Retur Penjualan",
  invoice_exchanges: "Tukar Faktur",
  purchase_requests: "Permintaan Pembelian",
  purchase_advances: "Uang Muka Pembelian",
  vendor_prices: "Harga Pemasok",
  purchase_orders: "Pesanan Pembelian",
  goods_receipts: "Penerimaan Barang",
  vendor_bills: "Tagihan Vendor",
  vendor_payments: "Pembayaran Vendor",
  tax_payments: "Penyetoran Pajak",
  purchase_returns: "Retur Pembelian",
  inventory: "Persediaan",
  stock_moves: "Mutasi Stok",
  racks: "Rak",
  stock_opname: "Stok Opname",
  stock_adjustments: "Penyesuaian Stok",
  inventory_transfers: "Transfer Gudang",
  material_issues: "Pengeluaran Material",
  production: "Produksi",
  production_orders: "Perintah Produksi",
  products: "Produk / BOM",
  work_orders: "Perintah Kerja",
  bom_revisions: "Revisi BOM",
  qc: "Kendali Mutu",
  qc_checklists: "Checklist QC",
  qc_inspections: "Inspeksi QC",
  nonconformances: "NCR",
  production_costs: "Biaya Produksi",
  attendance: "Absensi",
  work_schedules: "Jadwal Kerja",
  leave_requests: "Cuti",
  overtime: "Lembur",
  overtime_requests: "Pengajuan Lembur",
  payroll: "Penggajian",
  timesheets: "Lembar Waktu",
  holidays: "Hari Libur",
  employee_loans: "Pinjaman Karyawan",
  loans: "Pinjaman",
  appreciations: "Apresiasi",
  journals: "Jurnal",
  expenses: "Pengeluaran",
  petty_cash: "Kas Kecil",
  cost_centers: "Pusat Biaya",
  profit_centers: "Pusat Laba",
  bank_statements: "Rekening Koran",
  bank_reconciliation: "Rekonsiliasi Bank",
  bank_transfers: "Transfer Bank",
  cheques: "Giro & Cek",
  withholding_tax: "Pajak Potong (PPh)",
  leads: "Prospek",
  tickets: "Tiket",
  vehicles: "Kendaraan",
  vehicle_brands: "Merek Kendaraan",
  vehicle_models: "Model Kendaraan",
  vehicle_fitments: "Fitment",
  projects: "Proyek",
  assets: "Aset",
  asset_brands: "Merek Aset",
  asset_categories: "Kategori Aset",
  asset_transfers: "Transfer Aset",
  reports: "Laporan",
  settings: "Pengaturan Sistem",
  users: "Pengguna",
  roles: "Peran",
  workflows: "Alur Persetujuan",
  recurring_transactions: "Transaksi Berulang",
  favorite_transactions: "Transaksi Favorit",
}

/** Baca PERMISSIONS dari base-data.ts (komentar dibuang supaya kata di dalamnya tak ikut). */
function readPermissions() {
  const source = fs.readFileSync(BASE_DATA, "utf8")
  const block = source.split("export const PERMISSIONS")[1].split(/^\];/m)[0]
  const withoutComments = block.replace(/\/\/[^\n]*/g, "")
  const names = [...withoutComments.matchAll(/"([a-z][a-z0-9_]+)"/g)].map((m) => m[1])
  return [...new Set(names)]
}

function parsePermission(name) {
  const verb = VERBS.find((v) => name.startsWith(`${v}_`))
  if (!verb) throw new Error(`Permission "${name}" tidak memakai verba yang dikenal (${VERBS.join(", ")})`)
  return { verb, resource: name.slice(verb.length + 1) }
}

const permissions = readPermissions()
const unmapped = []
const byModule = new Map(MODULE_ORDER.map((key) => [key, []]))

for (const permissionKey of permissions) {
  const { verb, resource } = parsePermission(permissionKey)
  const moduleKey = RESOURCE_MODULE[resource]
  const label = RESOURCE_LABEL[resource]
  if (!moduleKey || !label) {
    unmapped.push(permissionKey)
    continue
  }
  byModule.get(moduleKey).push({ key: verb, resource, permissionKey, label })
}

if (unmapped.length > 0) {
  // Fail-closed: katalog tidak boleh diam-diam kehilangan permission.
  console.error("Permission tanpa modul/label:")
  for (const name of unmapped) console.error("  -", name)
  process.exit(1)
}

const verbIndex = (v) => VERBS.indexOf(v)
const lines = []
for (const moduleKey of MODULE_ORDER) {
  const actions = byModule.get(moduleKey).sort((a, b) => {
    if (a.label !== b.label) return a.label.localeCompare(b.label, "id")
    return verbIndex(a.key) - verbIndex(b.key)
  })
  lines.push(`  ${moduleKey}: [`)
  for (const a of actions) {
    lines.push(
      `    { key: "${a.key}", resource: "${a.resource}", permissionKey: "${a.permissionKey}", label: "${a.label}" },`,
    )
  }
  lines.push("  ],")
}

const banner = `/**
 * KATALOG PERMISSION (dibuat otomatis) — JANGAN diubah manual.
 *
 * Sumber: \`PERMISSIONS\` di \`src/lib/setup/base-data.ts\` (satu-satunya daftar
 * permission yang benar-benar ditegakkan). Skrip: \`scripts/generate-module-catalog.mjs\`.
 *
 * Cara menambah permission baru: tambahkan ke \`PERMISSIONS\`, jalankan
 * \`node scripts/generate-module-catalog.mjs\`, lalu \`npm run db:seed\`.
 *
 * Baris matriks = \`resource\` (entitas), kolom = \`key\` (verba aksi),
 * dan \`permissionKey\` = \`\${key}_\${resource}\` — invarian yang dikunci tes
 * \`src/lib/auth/__tests__/modules-catalog.test.ts\`.
 */

export type CatalogVerb =
${VERBS.map((v) => `  | "${v}"`).join("\n")}

/** Urutan kolom matriks (juga urutan resmi verba aksi). */
export const CATALOG_VERB_ORDER: CatalogVerb[] = [
${VERBS.map((v) => `  "${v}",`).join("\n")}
]

export interface CatalogAction {
  /** Verba aksi = kolom matriks. */
  key: CatalogVerb
  /** Entitas = baris matriks. */
  resource: string
  /** Nama permission yang dipakai \`requirePermission()\`/\`hasPermission()\`. */
  permissionKey: string
  /** Label entitas untuk UI. */
  label: string
}

/** ${permissions.length} permission dikelompokkan per modul (${byModule.size} modul). */
export const MODULE_ACTIONS: Record<string, CatalogAction[]> = {
`

fs.writeFileSync(OUT, `${banner}${lines.join("\n")}\n}\n`)

console.log(`Ditulis ${path.relative(ROOT, OUT)}`)
console.log(`  permission: ${permissions.length} | modul: ${byModule.size}`)
for (const moduleKey of MODULE_ORDER) {
  console.log(`  ${moduleKey.padEnd(14)} ${byModule.get(moduleKey).length} baris`)
}
