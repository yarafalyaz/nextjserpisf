/**
 * Backfill `slug` for every routed entity table.
 *
 * One pass per table, so the unique index is never transiently violated:
 *   1. Derive a base slug from the source column (name / document number).
 *   2. Number rows within each base-slug group by id; the first keeps the base,
 *      the rest get `<base>-<n>` (n = row number).
 *
 * Rows whose source yields an empty base keep NULL (resolver falls back to id).
 *
 * Usage: node scripts/backfill-slugs.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"

const DB = process.env.DB_CONTAINER ?? "silengkap_dev_db"
const DB_NAME = process.env.DB_NAME ?? "silengkap"
const DB_USER = process.env.DB_USER ?? "silengkap_user"
const DB_PASS = process.env.DB_PASS ?? "silengkap_pass123"

/**
 * table → source column used to derive the slug. A special value `id` means
 * "use the primary key, prefixed with rec-".
 */
const TABLE_SOURCES = {
  // master
  accounts: "name", banks: "name", barcodes: "barcode", departments: "name",
  warehouses: "name", positions: "name", employees: "name",
  items: "name",
  item_categories: "name", customer_categories: "name", item_groups: "name",
  expense_categories: "name", tax_groups: "name", brands: "name",
  payment_methods: "name", shipping_methods: "name", taxes: "name",
  customers: "name", unit_of_measures: "name", payment_terms: "name",
  vendors: "name",
  // aset
  asset_categories: "name", asset_brands: "name", assets: "name",
  asset_transfers: "id",
  // kendaraan
  vehicle_brands: "name", vehicle_models: "name", vehicles: "name",
  vehicle_fitment_rules: "id",
  // proyek
  projects: "name", tasks: "name",
  // produksi
  products: "name", bom_revisions: "revision_no", work_orders: "document_no",
  job_change_orders: "document_no",
  production_orders: "document_no", qc_checklists: "name",
  qc_inspections: "document_no", nonconformances: "document_no",
  // keuangan
  budgets: "name", statistical_key_figures: "name", journals: "journal_number",
  petty_cash: "document_no", bank_statements: "reference", expenses: "document_no",
  cost_centers: "name", bank_reconciliations: "reconciliation_number",
  bank_transfers: "document_no",
  purchase_advances: "document_no",
  tax_assessments: "assessment_number",
  tax_payments: "document_no",
  tax_invoices: "tax_invoice_number",
  withholding_certificates: "certificate_number",
  invoice_exchanges: "document_no",
  allocation_rules: "name", approval_workflows: "name", approvals: "reference_type",
  // inventaris
  rack_rows: "code", stock_moves: "document_no", material_issues: "document_no",
  stock_adjustments: "document_no", racks: "name",
  inventory_transfers: "document_no", material_requests: "document_no", stocktake_sessions: "document_no",
  // penjualan
  sales_invoices: "document_no", sales_payments: "document_no", quotations: "document_no",
  sales_orders: "document_no", sales_returns: "document_no",
  delivery_orders: "document_no", down_payments: "document_no",
  // pembelian
  vendor_payments: "document_no", goods_receipts: "document_no",
  purchase_requests: "document_no", purchase_orders: "document_no",
  purchase_returns: "document_no", vendor_bills: "document_no",
  // sdm
  appreciations: "id", leave_requests: "id", timesheets: "id",
  overtime_requests: "id", payrolls: "document_no", employee_loans: "id",
  // BR-LOAN-07/08 (162-V): dokumen ber-slug penomoran berelasi.
  employee_loan_repayments: "id", employee_loan_write_offs: "id",
  probation_reviews: "id", contract_decision_requests: "id",
  job_vacancies: "code", job_applicants: "name", performance_cycles: "name",
  performance_reviews: "id", competencies: "name", trainings: "title",
  employee_disciplinary_records: "id",
  disciplinary_deduction_decisions: "document_no",
  // F-2026-10-25-010-S: pengajuan koreksi absensi ber-slug sejak dibuat.
  attendance_corrections: "id",
  // crm
  leads: "name", crm_tickets: "subject",
  // pengaturan
  roles: "name", users: "name",
  withholding_tax_types: "name", recurring_transactions: "name",
  // kendaraan milik pelanggan (sub-resource) — pelat nomor paling terbaca
  customer_vehicles: "plate_number",
}

function sql(query) {
  // S4036: docker tidak dicari lewat PATH pemanggil; hanya lokasi tetap.
  const dockerBin = [
    "/usr/local/bin/docker",
    "/usr/bin/docker",
    "/opt/homebrew/bin/docker",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
  ].find((p) => existsSync(p))
  if (!dockerBin) {
    throw new Error("docker tidak ditemukan di lokasi tetap — install Docker Desktop / docker CLI.")
  }
  return execFileSync(
    dockerBin,
    ["exec", "-i", DB, "mysql", `-u${DB_USER}`, `-p${DB_PASS}`, DB_NAME, "-N", "-B", "-e", query],
    { encoding: "utf8" },
  )
}

/** Only backfill tables whose `slug` column actually exists in this DB. */
function existingSlugTables() {
  const rows = sql(
    `SELECT table_name FROM information_schema.columns WHERE table_schema='${DB_NAME}' AND column_name='slug';`,
  )
  return new Set(rows.split("\n").map((r) => r.trim()).filter(Boolean))
}

const BASE_EXPR = (col) => {
  if (col === "id") return `CONCAT('rec-', id)`
  return `NULLIF(TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(REGEXP_REPLACE(${col}, '[^a-zA-Z0-9]+', '-'), '-+', '-'))), '')`
}

const present = existingSlugTables()
let total = 0
const skipped = []

for (const [table, source] of Object.entries(TABLE_SOURCES)) {
  if (!present.has(table)) {
    skipped.push(table)
    continue
  }

  // Compute the final slug in ONE statement: base + suffix for duplicates.
  const q = `
    UPDATE \`${table}\` t
    JOIN (
      SELECT id,
             CONCAT(base, IF(rn = 1, '', CONCAT('-', rn))) AS final_slug
      FROM (
        SELECT id,
               ${BASE_EXPR(source)} AS base,
               ROW_NUMBER() OVER (PARTITION BY ${BASE_EXPR(source)} ORDER BY id) AS rn
        FROM \`${table}\`
      ) x
      WHERE base IS NOT NULL
    ) d ON d.id = t.id
    SET t.slug = d.final_slug
    WHERE t.slug IS NULL;
  `
  sql(q)
  const count = sql(`SELECT COUNT(*) FROM \`${table}\` WHERE slug IS NOT NULL;`).trim()
  total += Number(count)
  console.log(`${table.padEnd(24)} → ${count} slugs`)
}

if (skipped.length) console.log(`\nSkipped (no slug column): ${skipped.join(", ")}`)
console.log(`\nDone. ${total} rows slugged.`)
