/**
 * Resource permission registry for ActionDropdown auto-derivation.
 *
 * When callers pass editHref / deleteHref without explicit editPermission /
 * deletePermission, ActionDropdown looks up the longest matching prefix here
 * to decide which perm gates the action. Explicit props always win.
 *
 * If a route isn't listed, the dropdown falls back to the legacy
 * "always show" behavior — log a console.warn so missing entries are visible
 * in dev. New modules should add their entry here.
 *
 * Convention: `<module>/<resource>` → `edit_<resource>` / `delete_<resource>`
 * with hyphen→underscore and resource→noun mapping (e.g. `barang` → `items`).
 * Special cases (hari-libur → manage_holidays, tugas → edit_projects) are
 * listed explicitly.
 */
export const ROUTE_PERMS: ReadonlyArray<{
  prefix: string
  edit?: string
  delete?: string
}> = [
  // Master Data
  { prefix: "/master/barang", edit: "edit_items", delete: "delete_items" },
  { prefix: "/master/kategori-barang", edit: "edit_item_categories", delete: "delete_item_categories" },
  { prefix: "/master/merek", edit: "edit_brands", delete: "delete_brands" },
  { prefix: "/master/satuan", edit: "edit_units", delete: "edit_units" },
  { prefix: "/master/pelanggan", edit: "edit_customers", delete: "delete_customers" },
  { prefix: "/master/kategori-pelanggan", edit: "edit_customers", delete: "delete_customers" },
  { prefix: "/master/pemasok", edit: "edit_vendors", delete: "delete_vendors" },
  { prefix: "/master/gudang", edit: "edit_warehouses", delete: "delete_warehouses" },
  { prefix: "/master/karyawan", edit: "edit_employees", delete: "delete_employees" },
  { prefix: "/master/departemen", edit: "edit_departments", delete: "delete_departments" },
  { prefix: "/master/jabatan", edit: "edit_positions", delete: "delete_positions" },
  { prefix: "/master/akun", edit: "edit_accounts", delete: "delete_accounts" },
  { prefix: "/master/bank", edit: "edit_banks", delete: "delete_banks" },
  { prefix: "/master/pajak", edit: "edit_taxes", delete: "delete_taxes" },
  { prefix: "/master/kelompok-pajak", edit: "edit_taxes", delete: "delete_taxes" },
  { prefix: "/master/barcode", edit: "edit_barcodes", delete: "delete_barcodes" },
  { prefix: "/master/syarat-pembayaran", edit: "edit_payment_terms", delete: "delete_payment_terms" },
  { prefix: "/master/metode-pembayaran", edit: "edit_payment_methods", delete: "delete_payment_methods" },
  { prefix: "/master/metode-pengiriman", edit: "edit_shipping_methods", delete: "delete_shipping_methods" },

  // Penjualan
  { prefix: "/penjualan/penawaran", edit: "edit_quotations", delete: "delete_quotations" },
  { prefix: "/penjualan/uang-muka", edit: "edit_down_payments", delete: "delete_down_payments" },
  { prefix: "/penjualan/pesanan", edit: "edit_sales_orders", delete: "delete_sales_orders" },
  { prefix: "/penjualan/surat-jalan", edit: "edit_delivery_orders", delete: "delete_delivery_orders" },
  { prefix: "/penjualan/faktur", edit: "edit_sales_invoices", delete: "delete_sales_invoices" },
  { prefix: "/penjualan/pembayaran", edit: "edit_sales_payments", delete: "delete_sales_payments" },
  { prefix: "/penjualan/retur", edit: "edit_sales_returns", delete: "delete_sales_returns" },

  // Pembelian
  { prefix: "/pembelian/permintaan", edit: "edit_purchase_requests", delete: "delete_purchase_requests" },
  { prefix: "/pembelian/pesanan", edit: "edit_purchase_orders", delete: "delete_purchase_orders" },
  { prefix: "/pembelian/penerimaan", edit: "edit_goods_receipts", delete: "delete_goods_receipts" },
  { prefix: "/pembelian/tagihan", edit: "edit_vendor_bills", delete: "delete_vendor_bills" },
  { prefix: "/pembelian/pembayaran-vendor", edit: "edit_vendor_payments", delete: "delete_vendor_payments" },
  { prefix: "/pembelian/retur", edit: "edit_purchase_returns", delete: "delete_purchase_returns" },

  // Inventaris
  // /inventaris/scan dan /inventaris/mutasi-stok hanya menyediakan aksi lihat
  // (tidak ada edit/delete), jadi tidak didaftarkan di sini. Sebelumnya keduanya
  // memakai edit_inventory/edit_stock_moves/delete_* yang tidak ada di seed,
  // sehingga bila kelak diberi aksi baris tombolnya tak akan pernah muncul.
  { prefix: "/inventaris/penyesuaian", edit: "edit_stock_adjustments", delete: "delete_stock_adjustments" },
  { prefix: "/inventaris/transfer", edit: "edit_inventory_transfers", delete: "delete_inventory_transfers" },
  { prefix: "/inventaris/pengeluaran-material", edit: "edit_material_issues", delete: "delete_material_issues" },
  { prefix: "/inventaris/rak", edit: "create_warehouses", delete: "delete_warehouses" },
  { prefix: "/inventaris/baris-rak", edit: "manage_inventory", delete: "manage_inventory" },

  // Manufaktur
  { prefix: "/produksi/perintah-kerja", edit: "edit_work_orders", delete: "delete_work_orders" },
  { prefix: "/produksi/production-orders", edit: "edit_production_orders", delete: "delete_production_orders" },
  { prefix: "/produksi/products", edit: "edit_products", delete: "delete_products" },
  // BOM revisions are governed by a single capability (create/edit/release/delete).
  { prefix: "/produksi/bom-revisi", edit: "manage_bom_revisions", delete: "manage_bom_revisions" },
  // QC checklists are managed under one capability; inspections/NCR likewise.
  { prefix: "/produksi/qc/checklist", edit: "manage_qc_checklists", delete: "manage_qc_checklists" },
  { prefix: "/produksi/qc/inspeksi", edit: "manage_qc_inspections", delete: "manage_qc_inspections" },
  { prefix: "/produksi/qc/ncr", edit: "manage_nonconformances", delete: "manage_nonconformances" },

  // SDM — tasks reuse project edit perms
  { prefix: "/proyek/tugas", edit: "edit_projects", delete: "delete_projects" },
  { prefix: "/proyek", edit: "edit_projects", delete: "delete_projects" },

  // SDM
  { prefix: "/sdm/cuti", edit: "edit_leave_requests", delete: "delete_leave_requests" },
  { prefix: "/sdm/lembur", edit: "edit_overtime_requests", delete: "delete_overtime_requests" },
  // Payroll hanya punya aksi ubah (tidak ada deletePayroll), jadi tanpa delete.
  { prefix: "/sdm/penggajian", edit: "edit_payroll" },

  // Timesheet/appreciation edits are enforced server-side by
  // updateTimesheet/updateAppreciation with create_timesheets /
  // create_appreciations, so the row action must gate on the same permission
  // (same pattern as /sdm/pinjaman below). Mapping them to edit_timesheets /
  // edit_appreciations - which exist in no permission row - hid the Edit button
  // from every non-super-admin even when they were authorized to edit.
  { prefix: "/sdm/lembar-waktu", edit: "create_timesheets", delete: "delete_timesheets" },
  { prefix: "/sdm/pinjaman", edit: "create_loans", delete: "delete_loans" },
  { prefix: "/sdm/apresiasi", edit: "create_appreciations", delete: "delete_appreciations" },

  // Keuangan
  { prefix: "/keuangan/jurnal", edit: "edit_journals", delete: "delete_journals" },
  { prefix: "/keuangan/pengeluaran", edit: "edit_expenses", delete: "delete_expenses" },
  { prefix: "/keuangan/kas-kecil", edit: "edit_petty_cash", delete: "delete_petty_cash" },
  { prefix: "/keuangan/anggaran", edit: "edit_budgets", delete: "delete_budgets" },
  { prefix: "/keuangan/pusat-biaya", edit: "edit_cost_centers", delete: "delete_cost_centers" },
  { prefix: "/master/kategori-pengeluaran", edit: "manage_expense_categories", delete: "manage_expense_categories" },
  { prefix: "/anggaran/alokasi-skf", edit: "edit_accounts", delete: "delete_accounts" },
  { prefix: "/pengaturan/workflow", edit: "manage_settings", delete: "manage_settings" },
  // Rekening koran (laporan-bank) hanya lihat + tambah (createBankStatement
  // memakai create_journals) sehingga tak punya aksi baris. Rekonsiliasi bank
  // ditulis memakai manage_bank_reconciliation, sama dengan halaman "tambah"-nya.
  { prefix: "/keuangan/rekonsiliasi-bank", edit: "manage_bank_reconciliation" },
  // SKF master (angka kunci statistik) is gated by the account permissions the
  // edit page + updateStatisticalKeyFigure action enforce (create_accounts /
  // edit_accounts); only its Delete uses delete_statistical_key_figures. The
  // registry previously pointed edit at edit_statistical_key_figures, so the row
  // Edit button was hidden from every accountant who could actually open the page.
  { prefix: "/keuangan/angka-kunci-statistik", edit: "edit_accounts", delete: "delete_statistical_key_figures" },

  // CRM
  { prefix: "/crm/leads", edit: "edit_leads", delete: "delete_leads" },
  { prefix: "/crm/tickets", edit: "edit_tickets", delete: "delete_tickets" },

  // Kendaraan
  { prefix: "/kendaraan/merek", edit: "edit_vehicle_brands", delete: "delete_vehicle_brands" },
  { prefix: "/kendaraan/model", edit: "edit_vehicle_models", delete: "delete_vehicle_models" },
  { prefix: "/kendaraan", edit: "edit_vehicles", delete: "delete_vehicles" },

  // Aset
  { prefix: "/aset/kategori", edit: "edit_asset_categories", delete: "delete_asset_categories" },
  { prefix: "/aset/merek", edit: "edit_asset_brands", delete: "delete_asset_brands" },
  { prefix: "/aset/transfer", edit: "edit_asset_transfers", delete: "delete_asset_transfers" },
  { prefix: "/aset", edit: "edit_assets", delete: "delete_assets" },
]

/**
 * Resolve the permission key required to edit/delete a record at the given href.
 * Returns `undefined` if the route isn't registered — caller should warn.
 *
 * Longest prefix wins so `/proyek/tugas` matches its dedicated entry over
 * the broader `/proyek`.
 */
export function resolveEditPerm(href: string | undefined): string | undefined {
  if (!href) return undefined
  let best: { length: number; edit?: string } | null = null
  for (const entry of ROUTE_PERMS) {
    if (href === entry.prefix || href.startsWith(entry.prefix + "/")) {
      if (!best || entry.prefix.length > best.length) {
        best = { length: entry.prefix.length, edit: entry.edit }
      }
    }
  }
  return best?.edit
}

export function resolveDeletePerm(href: string | undefined): string | undefined {
  if (!href) return undefined
  let best: { length: number; delete?: string } | null = null
  for (const entry of ROUTE_PERMS) {
    if (href === entry.prefix || href.startsWith(entry.prefix + "/")) {
      if (!best || entry.prefix.length > best.length) {
        best = { length: entry.prefix.length, delete: entry.delete }
      }
    }
  }
  return best?.delete
}
