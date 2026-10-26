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

/** Entitas (baris matriks): [resource, modul pemilik, label UI]. Satu sumber untuk kedua peta di bawah. */
const RESOURCES = [
  ["dashboard", "dashboard", "Dasbor"],
  ["calendar", "calendar", "Kalender"],
  ["customers", "master", "Pelanggan"],
  ["vendors", "master", "Vendor"],
  ["items", "master", "Barang"],
  ["item_categories", "master", "Kategori Barang"],
  ["item_groups", "master", "Grup Barang"],
  ["brands", "master", "Merek"],
  ["barcodes", "master", "Barcode"],
  ["currencies", "master", "Mata Uang"],
  ["warehouses", "master", "Gudang"],
  ["employees", "master", "Karyawan"],
  // F-2026-10-24-099-S Q-PROB-2: resource persetujuan kontrak agar
  // approve_contracts lolos fail-closed generator (permission tanpa
  // resource di sini = process.exit(1)).
  ["contracts", "hrm", "Kontrak Karyawan"],
  // F-2026-10-25-005-S DISC-B1 Q-DISC-2: izin khusus disiplin.
  ["disciplinary_records", "hrm", "Rekod Disiplin"],
  ["departments", "master", "Departemen"],
  ["positions", "master", "Jabatan"],
  ["accounts", "master", "Akun (COA)"],
  ["banks", "master", "Bank"],
  ["taxes", "master", "Pajak"],
  ["tax_groups", "master", "Grup Pajak"],
  ["payment_terms", "master", "Termin Pembayaran"],
  ["payment_methods", "master", "Metode Pembayaran"],
  ["shipping_methods", "master", "Metode Pengiriman"],
  ["units", "master", "Satuan"],
  ["expense_categories", "master", "Kategori Beban"],
  ["quotations", "sales", "Penawaran"],
  ["down_payments", "sales", "Uang Muka"],
  ["sales_orders", "sales", "Pesanan Penjualan"],
  // F-2026-10-25-035-B (Q-CL2-2): resource override gerbang kredit agar
  // approve_credit_overrides lolos fail-closed generator.
  ["credit_overrides", "sales", "Override Batas Kredit"],
  ["delivery_orders", "sales", "Surat Jalan"],
  ["sales_invoices", "sales", "Faktur Penjualan"],
  ["sales_payments", "sales", "Pembayaran Penjualan"],
  ["sales_returns", "sales", "Retur Penjualan"],
  ["customer_price_lists", "sales", "Daftar Harga Pelanggan"],
  ["invoice_exchanges", "sales", "Tukar Faktur"],
  ["invoice_collection_followups", "sales", "Tindak Lanjut Penagihan"],
  ["sales_late_fees", "sales", "Dokumen Denda Piutang"],
  ["purchase_requests", "purchase", "Permintaan Pembelian"],
  ["purchase_advances", "purchase", "Uang Muka Pembelian"],
  ["vendor_prices", "purchase", "Harga Pemasok"],
  ["purchase_orders", "purchase", "Pesanan Pembelian"],
  ["goods_receipts", "purchase", "Penerimaan Barang"],
  ["vendor_bills", "purchase", "Tagihan Vendor"],
  ["vendor_payments", "purchase", "Pembayaran Vendor"],
  ["tax_payments", "finance", "Penyetoran Pajak"],
  ["tax_invoices", "finance", "Faktur Pajak"],
  ["withholding_certificates", "finance", "Bukti Potong (Bupot)"],
  ["purchase_returns", "purchase", "Retur Pembelian"],
  ["inventory", "inventory", "Persediaan"],
  ["stock_moves", "inventory", "Mutasi Stok"],
  ["racks", "inventory", "Rak"],
  ["stock_opname", "inventory", "Stok Opname"],
  ["stock_adjustments", "inventory", "Penyesuaian Stok"],
  ["inventory_transfers", "inventory", "Transfer Gudang"],
  ["material_requests", "inventory", "Permintaan Antar Gudang"],
  ["material_issues", "inventory", "Pengeluaran Material"],
  ["production", "manufacturing", "Produksi"],
  ["production_orders", "manufacturing", "Perintah Produksi"],
  ["products", "manufacturing", "Produk / BOM"],
  ["work_orders", "manufacturing", "Perintah Kerja"],
  ["warranty_claims", "manufacturing", "Klaim Garansi"],
  ["bom_revisions", "manufacturing", "Revisi BOM"],
  ["qc", "manufacturing", "Kendali Mutu"],
  ["qc_checklists", "manufacturing", "Checklist QC"],
  ["qc_inspections", "manufacturing", "Inspeksi QC"],
  ["nonconformances", "manufacturing", "NCR"],
  ["production_costs", "manufacturing", "Biaya Produksi"],
  ["attendance", "hrm", "Absensi"],
  ["attendance_corrections", "hrm", "Koreksi Absensi"],
  ["work_schedules", "hrm", "Jadwal Kerja"],
  ["leave_requests", "hrm", "Cuti"],
  ["overtime", "hrm", "Lembur"],
  ["overtime_requests", "hrm", "Pengajuan Lembur"],
  ["payroll", "hrm", "Penggajian"],
  ["timesheets", "hrm", "Lembar Waktu"],
  ["holidays", "hrm", "Hari Libur"],
  ["employee_loans", "hrm", "Pinjaman Karyawan"],
  // F-2026-10-25-018-S Q-LS-1: resource key pengajuan mandiri
  // create_employee_loan_requests (label beda dari "Pinjaman" staf).
  ["employee_loan_requests", "hrm", "Pengajuan Pinjaman Karyawan"],
  ["loans", "hrm", "Pinjaman"],
  ["appreciations", "hrm", "Apresiasi"],
  ["recruitments", "hrm", "Rekrutmen"],
  ["performance", "hrm", "Penilaian Kinerja"],
  ["competencies", "hrm", "Kompetensi"],
  ["trainings", "hrm", "Pelatihan & Pengembangan"],
  ["succession", "hrm", "Perencanaan Suksesi"],
  ["salary_amounts", "hrm", "Nominal Gaji"],
  ["journals", "finance", "Jurnal"],
  ["expenses", "finance", "Pengeluaran"],
  ["employee_reimbursements", "hrm", "Klaim Reimbursement"],
  ["petty_cash", "finance", "Kas Kecil"],
  ["cost_centers", "finance", "Pusat Biaya"],
  ["profit_centers", "finance", "Pusat Laba"],
  ["bank_statements", "finance", "Rekening Koran"],
  ["bank_reconciliation", "finance", "Rekonsiliasi Bank"],
  ["bank_transfers", "finance", "Transfer Bank"],
  ["cheques", "finance", "Giro & Cek"],
  ["withholding_tax", "finance", "Pajak Potong (PPh)"],
  ["leads", "crm", "Prospek"],
  ["tickets", "crm", "Tiket"],
  ["vehicles", "vehicles", "Kendaraan"],
  ["vehicle_brands", "vehicles", "Merek Kendaraan"],
  ["vehicle_models", "vehicles", "Model Kendaraan"],
  ["vehicle_fitments", "vehicles", "Fitment"],
  ["projects", "projects", "Proyek"],
  ["assets", "assets", "Aset"],
  ["asset_brands", "assets", "Merek Aset"],
  ["asset_groups", "assets", "Grup Aset"],
  ["asset_categories", "assets", "Kategori Aset"],
  ["asset_transfers", "assets", "Transfer Aset"],
  ["reports", "reports", "Laporan"],
  ["payroll_reports", "reports", "Laporan Gaji"],
  ["settings", "settings", "Pengaturan Sistem"],
  ["users", "settings", "Pengguna"],
  ["roles", "settings", "Peran"],
  ["workflows", "settings", "Alur Persetujuan"],
  ["recurring_transactions", "settings", "Transaksi Berulang"],
  ["favorite_transactions", "settings", "Transaksi Favorit"],
]

const RESOURCE_MODULE = Object.fromEntries(RESOURCES.map(([resource, moduleKey]) => [resource, moduleKey]))
const RESOURCE_LABEL = Object.fromEntries(RESOURCES.map(([resource, , label]) => [resource, label]))

/** Baca PERMISSIONS dari base-data.ts (komentar dibuang supaya kata di dalamnya tak ikut). */
function readPermissions() {
  const source = fs.readFileSync(BASE_DATA, "utf8")
  // Blok PERMISSIONS diakhiri `] as const;`, bukan `];` — berhenti di situ.
  // (Pola lama split(/^\];/m) tidak pernah cocok sehingga blok ikut membaca
  // ROLES di bawahnya dan meledak di "super_admin".)
  const block = source.split("export const PERMISSIONS")[1].split(/^\]\s+as const;/m)[0]
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
