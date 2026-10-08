import { createPool } from "mariadb";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

function buildPoolConfig() {
  const fallback = {
    socketPath: "/tmp/mysql.sock",
    user: "root",
    password: "",
    database: "yara_erp",
    connectionLimit: 5,
  };

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return fallback;

  try {
    const parsed = new URL(databaseUrl);
    const socketPath =
      parsed.searchParams.get("socketPath") ||
      parsed.searchParams.get("socket");
    const database =
      decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "yara_erp";
    const user = decodeURIComponent(parsed.username || "root");
    const password = decodeURIComponent(parsed.password || "");
    const connectionLimit = Number(
      parsed.searchParams.get("connectionLimit") || 5,
    );

    if (socketPath) {
      return { socketPath, user, password, database, connectionLimit };
    }

    return {
      host: parsed.hostname || "127.0.0.1",
      port: parsed.port ? Number(parsed.port) : 3306,
      user,
      password,
      database,
      connectionLimit,
    };
  } catch {
    return fallback;
  }
}

const pool = createPool(buildPoolConfig());

async function main() {
  const conn = await pool.getConnection();
  console.log("🌱 Seeding database...");

  try {
    // Create permissions
    const permissions = [
      "view_dashboard",
      "view_customers",
      "create_customers",
      "edit_customers",
      "delete_customers",
      "view_vendors",
      "create_vendors",
      "edit_vendors",
      "delete_vendors",
      "view_items",
      "create_items",
      "edit_items",
      "delete_items",
      "create_item_categories",
      "edit_item_categories",
      "delete_item_categories",
      "view_brands",
      "create_brands",
      "edit_brands",
      "delete_brands",
      "view_barcodes",
      "create_barcodes",
      "edit_barcodes",
      "delete_barcodes",
      "view_currencies",
      "create_currencies",
      "edit_currencies",
      "delete_currencies",
      "view_payment_terms",
      "create_payment_terms",
      "edit_payment_terms",
      "delete_payment_terms",
      "view_warehouses",
      "create_warehouses",
      "edit_warehouses",
      "delete_warehouses",
      "view_employees",
      "create_employees",
      "edit_employees",
      "delete_employees",
      "view_accounts",
      "create_accounts",
      "edit_accounts",
      "delete_accounts",
      "view_quotations",
      "create_quotations",
      "edit_quotations",
      "delete_quotations",
      "confirm_quotations",
      "approve_quotations",
      "view_sales_orders",
      "create_sales_orders",
      "edit_sales_orders",
      "delete_sales_orders",
      "approve_sales_orders",
      "view_sales_invoices",
      "create_sales_invoices",
      "edit_sales_invoices",
      "post_sales_invoices",
      "delete_sales_invoices",
      "approve_sales_invoices",
      "view_sales_payments",
      "create_sales_payments",
      "edit_sales_payments",
      "delete_sales_payments",
      "view_sales_returns",
      "create_sales_returns",
      "edit_sales_returns",
      "delete_sales_returns",
      "view_down_payments",
      "create_down_payments",
      "edit_down_payments",
      "confirm_down_payments",
      "delete_down_payments",
      "view_purchase_requests",
      "create_purchase_requests",
      "edit_purchase_requests",
      "approve_purchase_requests",
      "delete_purchase_requests",
      "view_purchase_orders",
      "create_purchase_orders",
      "edit_purchase_orders",
      "approve_purchase_orders",
      "delete_purchase_orders",
      "view_goods_receipts",
      "create_goods_receipts",
      "edit_goods_receipts",
      "verify_goods_receipts",
      "delete_goods_receipts",
      "view_purchase_returns",
      "create_purchase_returns",
      "edit_purchase_returns",
      "delete_purchase_returns",
      "view_vendor_bills",
      "create_vendor_bills",
      "edit_vendor_bills",
      "approve_vendor_bills",
      "delete_vendor_bills",
      "view_vendor_payments",
      "create_vendor_payments",
      "edit_vendor_payments",
      "delete_vendor_payments",
      "view_delivery_orders",
      "create_delivery_orders",
      "edit_delivery_orders",
      "delete_delivery_orders",
      "view_stock_moves",
      "view_stock_adjustments",
      "create_stock_adjustments",
      "edit_stock_adjustments",
      "process_stock_adjustments",
      "delete_stock_adjustments",
      "view_inventory_transfers",
      "create_inventory_transfers",
      "edit_inventory_transfers",
      "delete_inventory_transfers",
      "view_material_issues",
      "create_material_issues",
      "edit_material_issues",
      "delete_material_issues",
      "view_work_orders",
      "create_work_orders",
      "edit_work_orders",
      "complete_work_orders",
      "delete_work_orders",
      "view_work_schedules",
      "create_work_schedules",
      "delete_work_schedules",
      "view_attendance",
      "create_attendance",
      "edit_attendance",
      "manage_attendance",
      "view_leave_requests",
      "create_leave_requests",
      "edit_leave_requests",
      "approve_leave_requests",
      "delete_leave_requests",
      "view_overtime",
      "create_overtime_requests",
      "edit_overtime_requests",
      "approve_overtime",
      "approve_overtime_requests",
      "delete_overtime_requests",
      "view_payroll",
      "create_payroll",
      "edit_payroll",
      "process_payroll",
      "update_payroll",
      "view_journals",
      "create_journals",
      "edit_journals",
      "post_journals",
      "delete_journals",
      "view_expenses",
      "create_expenses",
      "edit_expenses",
      "approve_expenses",
      "delete_expenses",
      "view_petty_cash",
      "create_petty_cash",
      "delete_petty_cash",
      "view_bank_reconciliation",
      "manage_bank_reconciliation",
      "view_bank_statements",
      "view_reports",
      "view_leads",
      "create_leads",
      "edit_leads",
      "delete_leads",
      "manage_leads",
      "view_tickets",
      "create_tickets",
      "edit_tickets",
      "delete_tickets",
      "view_timesheets",
      "create_timesheets",
      "delete_timesheets",
      "view_assets",
      "create_assets",
      "manage_assets",
      "delete_assets",
      "view_appreciations",
      "create_appreciations",
      "delete_appreciations",
      "create_asset_brands",
      "delete_asset_brands",
      "create_asset_categories",
      "delete_asset_categories",
      "create_asset_transfers",
      "delete_asset_transfers",
      "view_vehicles",
      "create_vehicles",
      "edit_vehicles",
      "delete_vehicles",
      "view_vehicle_brands",
      "create_vehicle_brands",
      "edit_vehicle_brands",
      "delete_vehicle_brands",
      "create_vehicle_models",
      "edit_vehicle_models",
      "delete_vehicle_models",
      "view_vehicle_fitments",
      "create_vehicle_fitments",
      "edit_vehicle_fitments",
      "delete_vehicle_fitments",
      "view_projects",
      "create_projects",
      "edit_projects",
      "delete_projects",
      "manage_projects",
      "view_budgets",
      "create_budgets",
      "edit_budgets",
      "delete_budgets",
      "view_cost_centers",
      "create_cost_centers",
      "edit_cost_centers",
      "delete_cost_centers",
      "create_departments",
      "edit_departments",
      "delete_departments",
      "create_positions",
      "edit_positions",
      "delete_positions",
      "create_banks",
      "edit_banks",
      "delete_banks",
      "view_payment_methods",
      "create_payment_methods",
      "edit_payment_methods",
      "delete_payment_methods",
      "view_shipping_methods",
      "create_shipping_methods",
      "edit_shipping_methods",
      "delete_shipping_methods",
      "create_taxes",
      "edit_taxes",
      "delete_taxes",
      "create_holidays",
      "manage_holidays",
      "delete_holidays",
      "create_loans",
      "delete_loans",
      "create_products",
      "edit_products",
      "delete_products",
      "create_production_orders",
      "delete_production_orders",
      // BOM revisions: create/edit/release/delete a versioned BOM snapshot.
      // Kept as one capability so a role either governs BOM revisions or not.
      "manage_bom_revisions",
      "view_bom_revisions",
      // Quality control (PRD FAB-10/FAB-11/FAB-13): checklists, inspections, NCR.
      "view_qc",
      "manage_qc_checklists",
      "manage_qc_inspections",
      "manage_nonconformances",
      // Non-material production cost lines (PRD FAB-06/07/08/09).
      "manage_production_costs",
      "view_employee_loans",
      "manage_settings",
      "manage_users",
      "manage_roles",
      "manage_inventory",
      "manage_expense_categories",
      "approve_workflows",
      // --- Backfill: permissions yang dicek di action (requirePermission/hasPermission)
      // tapi sebelumnya tak pernah di-seed, sehingga role non-admin fail-CLOSED
      // (ketolak) dari fitur terkait. Semua 23 string ini diverifikasi dipakai di
      // kode produksi. super_admin/admin tetap dapat semua via grant menyeluruh.
      "edit_assets",
      "edit_asset_brands",
      "edit_asset_categories",
      "edit_asset_transfers",
      "edit_holidays",
      "edit_inventory",
      "edit_petty_cash",
      "edit_production",
      "edit_production_orders",
      // Key Figure Statistik: edit/delete are enforced by skf-values.actions.ts,
      // finance.actions.ts (deleteStatisticalKeyFigure) and bulk.actions.ts, but
      // were missed by the backfill below, so every role except super_admin was
      // redirected out of the feature (requirePermission -> redirect("/")).
      "edit_statistical_key_figures",
      "delete_statistical_key_figures",
      "edit_tax_groups",
      "edit_units",
      "view_asset_brands",
      "view_asset_categories",
      "view_asset_transfers",
      "view_banks",
      "view_departments",
      "view_inventory",
      "view_item_categories",
      "view_positions",
      "view_production",
      "view_statistical_key_figures",
      "view_tax_groups",
      "view_taxes",
      "view_units",
      // Approval permissions terpisah dari edit_* (Separation of Duties).
      "approve_vendor_payments",
      "approve_purchase_returns",
      // Approving/disbursing an employee loan gets its own permission. It used
      // to reuse "create_loans" in both approval.actions.ts and the status
      // workflow route, so whoever could raise a loan could also approve and
      // disburse it — no separation of duties, and a self-approval path.
      // Granted to admin/super_admin via "ALL"; grant it explicitly to finance
      // if that role is meant to approve loans.
      "approve_loans",
    ];

    for (const name of permissions) {
      await conn.query(
        "INSERT IGNORE INTO permissions (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name],
      );
    }
    console.log(`✅ ${permissions.length} permissions created`);

    // Create roles
    const roles = [
      "super_admin",
      "admin",
      "staff",
      "ga",
      "kepala_bengkel",
      "karyawan",
      "purchasing",
      "warehouse",
      "finance"
    ];
    for (const name of roles) {
      await conn.query(
        "INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name],
      );
    }
    console.log(`✅ ${roles.length} roles created/ensured`);

    const allPerms = await conn.query("SELECT id, name FROM permissions");
    const permIdByName = new Map<string, number>();
    for (const perm of allPerms) {
      permIdByName.set(perm.name, Number(perm.id));
    }

    const dbRoles = await conn.query("SELECT id, name FROM roles");
    const roleIdByName = new Map<string, number>();
    for (const role of dbRoles) {
      roleIdByName.set(role.name, Number(role.id));
    }

    // Explicit whitelists for each role
    const staffWhitelist = [
      "view_dashboard",
      "view_customers",
      "create_customers",
      "edit_customers",
      "view_vendors",
      "create_vendors",
      "edit_vendors",
      "view_items",
      "create_items",
      "edit_items",
      "view_item_categories",
      "create_item_categories",
      "edit_item_categories",
      "view_brands",
      "create_brands",
      "edit_brands",
      "view_barcodes",
      "create_barcodes",
      "edit_barcodes",
      "view_currencies",
      "view_payment_terms",
      "view_warehouses",
      "view_employees",
      "view_quotations",
      "create_quotations",
      "edit_quotations",
      "confirm_quotations",
      "view_sales_orders",
      "create_sales_orders",
      "edit_sales_orders",
      "view_sales_invoices",
      "create_sales_invoices",
      "edit_sales_invoices",
      "view_sales_payments",
      "create_sales_payments",
      "edit_sales_payments",
      "view_sales_returns",
      "create_sales_returns",
      "edit_sales_returns",
      "view_purchase_requests",
      "create_purchase_requests",
      "edit_purchase_requests",
      "view_purchase_orders",
      "create_purchase_orders",
      "edit_purchase_orders",
      "view_goods_receipts",
      "create_goods_receipts",
      "edit_goods_receipts",
      "view_delivery_orders",
      "create_delivery_orders",
      "edit_delivery_orders",
      "view_projects",
      "create_projects",
      "edit_projects",
      "view_vehicles",
      "view_vehicle_brands",
      "view_vehicle_fitments",
      "view_attendance",
      "create_attendance"
    ];

    const gaWhitelist = [
      "view_dashboard",
      "view_assets",
      "create_assets",
      "edit_assets",
      "delete_assets",
      "manage_assets",
      "view_asset_brands",
      "create_asset_brands",
      "edit_asset_brands",
      "delete_asset_brands",
      "view_asset_categories",
      "create_asset_categories",
      "edit_asset_categories",
      "delete_asset_categories",
      "view_asset_transfers",
      "create_asset_transfers",
      "edit_asset_transfers",
      "delete_asset_transfers",
      "view_vehicles",
      "create_vehicles",
      "edit_vehicles",
      "delete_vehicles",
      "view_vehicle_brands",
      "create_vehicle_brands",
      "edit_vehicle_brands",
      "delete_vehicle_brands",
      "view_vehicle_fitments",
      "create_vehicle_fitments",
      "edit_vehicle_fitments",
      "delete_vehicle_fitments",
      "view_attendance",
      "create_attendance",
      "edit_attendance",
      "manage_attendance",
      "view_leave_requests",
      "create_leave_requests",
      "edit_leave_requests",
      "approve_leave_requests",
      "delete_leave_requests",
      "view_projects",
      "create_projects",
      "edit_projects",
      "delete_projects",
      "manage_projects",
      "create_holidays",
      "edit_holidays",
      "manage_holidays",
      "delete_holidays",
      "view_employees",
      "view_departments",
      "view_positions"
    ];

    const kabengWhitelist = [
      "view_dashboard",
      "view_customers",
      "view_vendors",
      "view_items",
      "view_item_categories",
      "view_brands",
      "view_units",
      "view_warehouses",
      "view_employees",
      "view_projects",
      "view_vehicles",
      "view_vehicle_brands",
      "view_vehicle_fitments",
      "view_work_orders",
      "create_work_orders",
      "edit_work_orders",
      "complete_work_orders",
      "view_material_issues",
      "view_production",
      "create_production_orders",
      "edit_production_orders",
      "create_products",
      "edit_products",
      "manage_bom_revisions",
      "view_bom_revisions",
      "view_qc",
      "manage_qc_checklists",
      "manage_qc_inspections",
      "manage_nonconformances",
      "manage_production_costs",
      "view_timesheets",
      "create_timesheets",
      "view_overtime",
      "create_overtime_requests",
      "edit_overtime_requests",
      "approve_overtime_requests",
      "view_leave_requests",
      "create_leave_requests",
      "edit_leave_requests",
      "approve_leave_requests",
      "view_attendance",
      "create_attendance",
      "edit_attendance",
      "view_purchase_requests",
      "create_purchase_requests",
      "edit_purchase_requests"
    ];

    const karyawanWhitelist = [
      "view_dashboard",
      "view_items",
      "view_item_categories",
      "view_units",
      "view_projects",
      "view_work_orders",
      "view_attendance",
      "view_work_schedules",
      "view_leave_requests",
      "view_overtime",
      "view_payroll",
      "view_timesheets",
      "view_employee_loans"
    ];

    const purchasingWhitelist = [
      "view_dashboard",
      "view_items",
      "view_item_categories",
      "view_units",
      "view_brands",
      "view_vendors",
      "create_vendors",
      "edit_vendors",
      "view_purchase_requests",
      "create_purchase_requests",
      "edit_purchase_requests",
      "view_purchase_orders",
      "create_purchase_orders",
      "edit_purchase_orders",
      "view_purchase_returns",
      "create_purchase_returns",
      "edit_purchase_returns",
      "view_vendor_bills",
      "create_vendor_bills",
      "edit_vendor_bills",
      "view_goods_receipts"
    ];

    const warehouseWhitelist = [
      "view_dashboard",
      "view_items",
      "view_item_categories",
      "view_units",
      "view_warehouses",
      "view_stock_adjustments",
      "create_stock_adjustments",
      "edit_stock_adjustments",
      "process_stock_adjustments",
      "view_inventory_transfers",
      "create_inventory_transfers",
      "edit_inventory_transfers",
      "view_goods_receipts",
      "create_goods_receipts",
      "edit_goods_receipts",
      "verify_goods_receipts",
      "view_delivery_orders",
      "create_delivery_orders",
      "edit_delivery_orders",
      "view_material_issues",
      "create_material_issues",
      "edit_material_issues",
      "view_purchase_orders",
      "view_sales_orders"
    ];

    const financeWhitelist = [
      "view_dashboard",
      "view_accounts",
      "create_accounts",
      "edit_accounts",
      "delete_accounts",
      "view_journals",
      "create_journals",
      "edit_journals",
      "post_journals",
      "delete_journals",
      "view_expenses",
      "create_expenses",
      "edit_expenses",
      "approve_expenses",
      "delete_expenses",
      "view_petty_cash",
      "create_petty_cash",
      "edit_petty_cash",
      "delete_petty_cash",
      "view_bank_reconciliation",
      "manage_bank_reconciliation",
      "view_bank_statements",
      "view_budgets",
      "create_budgets",
      "edit_budgets",
      "delete_budgets",
      "view_cost_centers",
      "create_cost_centers",
      "edit_cost_centers",
      "delete_cost_centers",
      "view_down_payments",
      "create_down_payments",
      "edit_down_payments",
      "confirm_down_payments",
      "delete_down_payments",
      "view_payroll",
      "create_payroll",
      "edit_payroll",
      "process_payroll",
      "update_payroll",
      "view_employee_loans",
      "create_loans",
      "delete_loans",
      "view_taxes",
      "create_taxes",
      "edit_taxes",
      "delete_taxes",
      "view_tax_groups",
      "edit_tax_groups",
      "view_payment_terms",
      "create_payment_terms",
      "edit_payment_terms",
      "delete_payment_terms",
      "view_payment_methods",
      "create_payment_methods",
      "edit_payment_methods",
      "delete_payment_methods",
      "view_vendor_bills",
      "create_vendor_bills",
      "edit_vendor_bills",
      "approve_vendor_bills",
      "delete_vendor_bills",
      "view_vendor_payments",
      "create_vendor_payments",
      "edit_vendor_payments",
      "approve_vendor_payments",
      "delete_vendor_payments",
      "view_sales_invoices",
      "create_sales_invoices",
      "edit_sales_invoices",
      "post_sales_invoices",
      "delete_sales_invoices",
      "approve_sales_invoices",
      "view_sales_payments",
      "create_sales_payments",
      "edit_sales_payments",
      "delete_sales_payments",
      "view_quotations",
      "approve_quotations",
      "view_sales_orders",
      "approve_sales_orders",
      "view_purchase_requests",
      "approve_purchase_requests",
      "view_purchase_orders",
      "approve_purchase_orders",
      "view_reports",
      "view_customers",
      "view_vendors",
      "view_items",
      "view_warehouses",
      "view_employees",
      "view_projects",
      "view_departments",
      "view_positions"
    ];

    async function assignPermissionsToRole(roleName: string, whitelistedPerms: string[] | "ALL") {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) {
        console.warn(`⚠️ Role '${roleName}' not found in database, skipping permissions assignment`);
        return;
      }

      await conn.query("DELETE FROM _RolePermissions WHERE B = ?", [roleId]);

      if (whitelistedPerms === "ALL") {
        for (const pid of permIdByName.values()) {
          await conn.query(
            "INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)",
            [pid, roleId]
          );
        }
      } else {
        for (const pname of whitelistedPerms) {
          const pid = permIdByName.get(pname);
          if (!pid) {
            console.warn(`⚠️ Permission '${pname}' not found, skipping for role '${roleName}'`);
            continue;
          }
          await conn.query(
            "INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)",
            [pid, roleId]
          );
        }
      }
    }

    await assignPermissionsToRole("super_admin", "ALL");
    await assignPermissionsToRole("admin", "ALL");
    await assignPermissionsToRole("staff", staffWhitelist);
    await assignPermissionsToRole("ga", gaWhitelist);
    await assignPermissionsToRole("kepala_bengkel", kabengWhitelist);
    await assignPermissionsToRole("karyawan", karyawanWhitelist);
    await assignPermissionsToRole("purchasing", purchasingWhitelist);
    await assignPermissionsToRole("warehouse", warehouseWhitelist);
    await assignPermissionsToRole("finance", financeWhitelist);

    console.log("✅ All roles whitelists successfully mapped");

    // Create system settings
    await conn.query(
      `INSERT IGNORE INTO system_settings (id, company_name, company_email, costing_method, fiscal_year_start_month, currency_code, currency_symbol, created_at, updated_at)
       VALUES (1, 'Yara ERP', 'admin@erp.yarasoft.net', 'FIFO', 1, 'IDR', 'Rp ', NOW(), NOW())`,
    );
    console.log("✅ System settings created");

    // Create Chart of Accounts
    const accounts = [
      ["1000", "Kas & Bank", "ASSET"],
      ["1100", "Piutang Usaha", "ASSET"],
      ["1150", "Piutang Karyawan", "ASSET"],
      ["1200", "Persediaan", "ASSET"],
      ["1300", "Aset Tetap", "ASSET"],
      ["1400", "PPN Masukan", "ASSET"],
      ["1500", "Barang Dalam Proses (WIP)", "ASSET"],
      ["1600", "Penyesuaian Persediaan", "EXPENSE"],
      ["2000", "Hutang Usaha", "LIABILITY"],
      ["2100", "Hutang Pajak", "LIABILITY"],
      ["2200", "PPN Keluaran", "LIABILITY"],
      ["2300", "Hutang Gaji", "LIABILITY"],
      ["3000", "Modal", "EQUITY"],
      ["4000", "Pendapatan Penjualan", "REVENUE"],
      ["4100", "Pendapatan Lain-lain", "REVENUE"],
      ["4200", "Retur Penjualan", "REVENUE"],
      ["5000", "Harga Pokok Penjualan", "EXPENSE"],
      ["5100", "Beban Operasional", "EXPENSE"],
      ["5110", "Beban Administrasi & Umum", "EXPENSE"],
      ["5200", "Beban Gaji", "EXPENSE"],
      ["5300", "Beban Penyusutan", "EXPENSE"],
      ["5400", "Beban Material", "EXPENSE"],
      ["5500", "Kas Kecil", "ASSET"],
      ["5600", "Beban Pembelian", "EXPENSE"],
      ["5700", "Diskon Pembelian", "EXPENSE"],
      ["5800", "Ongkos Kirim", "EXPENSE"],
      ["5810", "Beban Admin Bank", "EXPENSE"],
      ["5900", "Retur Pembelian", "EXPENSE"],
    ];

    for (const [code, name, type] of accounts) {
      await conn.query(
        "INSERT IGNORE INTO accounts (code, name, type, is_active, created_at, updated_at) VALUES (?, ?, ?, true, NOW(), NOW())",
        [code, name, type],
      );
    }
    console.log(`✅ ${accounts.length} accounts created`);

    // Create default warehouse
    await conn.query(
      `INSERT IGNORE INTO warehouses (code, name, address, is_active, created_at, updated_at)
       VALUES ('WH-0001', 'Gudang Utama', 'Jl. Industri No. 1', true, NOW(), NOW())`,
    );
    console.log("✅ Default warehouse created");

    // Create departments (current org structure)
    // Codes follow the auto-generated DEPT-#### scheme.
    const departments: [string, string][] = [
      ["DEPT-0001", "Lapangan"],
      ["DEPT-0002", "Kantor"],
    ];
    const departmentIdByName: Record<string, number> = {};
    for (const [code, name] of departments) {
      const existingDept = await conn.query(
        "SELECT id FROM departments WHERE name = ? LIMIT 1",
        [name],
      );
      if (!existingDept || existingDept.length === 0) {
        await conn.query(
          "INSERT INTO departments (code, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
          [code, name],
        );
      }
      const dept = await conn.query(
        "SELECT id FROM departments WHERE name = ? LIMIT 1",
        [name],
      );
      departmentIdByName[name] = Number(dept[0].id);
    }
    console.log("✅ Departments created");

    // Create positions linked to their department.
    // Codes follow the auto-generated POS-#### scheme.
    const positions: [string, string, string][] = [
      // [code, name, departmentName]
      ["POS-0001", "Helper", "Lapangan"],
      ["POS-0002", "Welder", "Lapangan"],
      ["POS-0003", "Kepala Bengkel", "Lapangan"],
      ["POS-0004", "Assisten Kepala Bengkel", "Lapangan"],
      ["POS-0005", "Finishing", "Lapangan"],
      ["POS-0006", "Admin Keuangan", "Kantor"],
      ["POS-0007", "General Affair", "Kantor"],
      ["POS-0008", "Manajer Umum", "Kantor"],
      ["POS-0009", "Drafter", "Kantor"],
      ["POS-0010", "Gudang & Pembelian", "Kantor"],
    ];
    const positionIdByName: Record<string, number> = {};
    for (const [code, name, deptName] of positions) {
      const departmentId = departmentIdByName[deptName] ?? null;
      const existingPos = await conn.query(
        "SELECT id FROM positions WHERE name = ? LIMIT 1",
        [name],
      );
      if (!existingPos || existingPos.length === 0) {
        await conn.query(
          "INSERT INTO positions (code, name, department_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
          [code, name, departmentId],
        );
      } else {
        // Keep department linkage in sync for pre-existing rows.
        await conn.query(
          "UPDATE positions SET department_id = ? WHERE id = ?",
          [departmentId, existingPos[0].id],
        );
      }
      const [pos] = await conn.query(
        "SELECT id FROM positions WHERE name = ? LIMIT 1",
        [name],
      );
      positionIdByName[name] = Number(pos.id);
    }
    console.log("✅ Positions created");

    // === SEED 9 DEMO USERS AND EMPLOYEES ===
    console.log("🌱 Seeding demo users and employees...");
    const DEMO_PASSWORD_HASH = "$2b$12$/V3/9lxsoHgIJKxD9TbQCu05dcR/UKyOoJNpAhMKlJBiLn1cXwEa."; // 'demo1234'

    const demoUsers = [
      {
        name: "Super Admin",
        email: "admin@erp.yarasoft.net",
        roleName: "super_admin",
        employeeNo: "EMP-00001",
        departmentName: "Kantor",
        positionName: "Manajer Umum",
        baseSalary: 10000000.00
      },
      {
        name: "Dewi Admin",
        email: "admin.dewi@erp.yarasoft.net",
        roleName: "admin",
        employeeNo: "EMP-00002",
        departmentName: "Kantor",
        positionName: "Admin Keuangan",
        baseSalary: 7000000.00
      },
      {
        name: "Siti Staff",
        email: "staff@erp.yarasoft.net",
        roleName: "staff",
        employeeNo: "EMP-00003",
        departmentName: "Kantor",
        positionName: "Admin Keuangan",
        baseSalary: 5500000.00
      },
      {
        name: "Gani GA",
        email: "ga@erp.yarasoft.net",
        roleName: "ga",
        employeeNo: "EMP-00004",
        departmentName: "Kantor",
        positionName: "General Affair",
        baseSalary: 6000000.00
      },
      {
        name: "Bambang Kabeng",
        email: "kabeng@erp.yarasoft.net",
        roleName: "kepala_bengkel",
        employeeNo: "EMP-00005",
        departmentName: "Lapangan",
        positionName: "Kepala Bengkel",
        baseSalary: 8500000.00
      },
      {
        name: "Karyawan Demo",
        email: "karyawan@erp.yarasoft.net",
        roleName: "karyawan",
        employeeNo: "EMP-00006",
        departmentName: "Lapangan",
        positionName: "Helper",
        baseSalary: 4500000.00
      },
      {
        name: "Putri Purchasing",
        email: "pembelian@erp.yarasoft.net",
        roleName: "purchasing",
        employeeNo: "EMP-00007",
        departmentName: "Kantor",
        positionName: "Gudang & Pembelian",
        baseSalary: 6500000.00
      },
      {
        name: "Wawan Warehouse",
        email: "gudang@erp.yarasoft.net",
        roleName: "warehouse",
        employeeNo: "EMP-00008",
        departmentName: "Lapangan",
        positionName: "Gudang & Pembelian",
        baseSalary: 6000000.00
      },
      {
        name: "Fani Finance",
        email: "keuangan@erp.yarasoft.net",
        roleName: "finance",
        employeeNo: "EMP-00009",
        departmentName: "Kantor",
        positionName: "Admin Keuangan",
        baseSalary: 7500000.00
      }
    ];

    for (const demo of demoUsers) {
      let hashedPassword = DEMO_PASSWORD_HASH;
      if (demo.email === (process.env.SEED_ADMIN_EMAIL || "admin@erp.yarasoft.net") && process.env.SEED_ADMIN_PASSWORD) {
        hashedPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12);
      }

      const existingUser = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [demo.email]);
      let userId: number;
      if (!existingUser || existingUser.length === 0) {
        await conn.query(
          "INSERT INTO users (name, email, password, is_active, created_at, updated_at) VALUES (?, ?, ?, true, NOW(), NOW())",
          [demo.name, demo.email, hashedPassword]
        );
        const [usr] = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [demo.email]);
        userId = Number(usr.id);
      } else {
        userId = Number(existingUser[0].id);
        await conn.query(
          "UPDATE users SET name = ?, password = ?, is_active = true, updated_at = NOW() WHERE id = ?",
          [demo.name, hashedPassword, userId]
        );
      }

      const roleId = roleIdByName.get(demo.roleName);
      if (roleId) {
        await conn.query("DELETE FROM _UserRoles WHERE B = ?", [userId]);
        await conn.query("INSERT IGNORE INTO _UserRoles (A, B) VALUES (?, ?)", [roleId, userId]);
      }

      const deptId = departmentIdByName[demo.departmentName] ?? null;
      const posId = positionIdByName[demo.positionName] ?? null;

      const existingEmployee = await conn.query("SELECT id FROM employees WHERE employee_no = ? LIMIT 1", [demo.employeeNo]);
      if (!existingEmployee || existingEmployee.length === 0) {
        await conn.query(
          `INSERT INTO employees (user_id, employee_no, name, email, department_id, position_id, join_date, payment_frequency, base_salary, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), 'MONTHLY', ?, true, NOW(), NOW())`,
          [userId, demo.employeeNo, demo.name, demo.email, deptId, posId, demo.baseSalary]
        );
      } else {
        await conn.query(
          `UPDATE employees 
           SET user_id = ?, name = ?, email = ?, department_id = ?, position_id = ?, base_salary = ?, is_active = true, updated_at = NOW()
           WHERE employee_no = ?`,
          [userId, demo.name, demo.email, deptId, posId, demo.baseSalary, demo.employeeNo]
        );
      }
    }
    console.log(`✅ ${demoUsers.length} demo users and employee mappings seeded successfully`);

    // Create default payment methods (codes follow the auto-generated MTP- scheme)
    const paymentMethods: [string, string][] = [
      ["MTP-0001", "Transfer Bank"],
      ["MTP-0002", "Tunai"],
      ["MTP-0003", "Cek/Giro"],
      ["MTP-0004", "Kartu Kredit/Debit"],
      ["MTP-0005", "E-Wallet"],
      ["MTP-0006", "Termin/Tempo"],
    ];
    for (const [code, name] of paymentMethods) {
      await conn.query(
        "INSERT IGNORE INTO payment_methods (code, name, is_active, created_at, updated_at) VALUES (?, ?, true, NOW(), NOW())",
        [code, name],
      );
    }
    console.log("✅ Payment methods created");

    // Create default shipping methods (codes follow the auto-generated MTK- scheme)
    const shippingMethods: [string, string][] = [
      ["MTK-0001", "Ambil Sendiri"],
      ["MTK-0002", "Kurir"],
      ["MTK-0003", "Ekspedisi/Cargo"],
      ["MTK-0004", "Diantar"],
    ];
    for (const [code, name] of shippingMethods) {
      await conn.query(
        "INSERT IGNORE INTO shipping_methods (code, name, is_active, created_at, updated_at) VALUES (?, ?, true, NOW(), NOW())",
        [code, name],
      );
    }
    console.log("✅ Shipping methods created");

    // Create document sequences
    const sequences = [
      "QUO",
      "SO",
      "INV",
      "PAY",
      "PO",
      "GR",
      "PR",
      "WO",
      "ADJ",
      "TRF",
      "MI",
      "EXP",
      "PC",
    ];
    for (const key of sequences) {
      await conn.query(
        "INSERT IGNORE INTO document_sequences (`key`, current_value, created_at, updated_at) VALUES (?, 0, NOW(), NOW())",
        [key],
      );
    }
    console.log("✅ Document sequences created");

    // Create vehicle brands, models, and variants from vehicles.json
    const vehiclesDataPath = path.resolve(__dirname, "vehicles.json");
    if (fs.existsSync(vehiclesDataPath)) {
      console.log("🌱 Seeding vehicle brands, models, and variants...");
      const { brands, models, variants } = JSON.parse(
        fs.readFileSync(vehiclesDataPath, "utf8"),
      );

      for (const b of brands) {
        await conn.query(
          "INSERT IGNORE INTO vehicle_brands (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
          [b.id, b.name],
        );
      }
      console.log(`✅ ${brands.length} vehicle brands seeded/checked`);

      for (const m of models) {
        await conn.query(
          "INSERT IGNORE INTO vehicle_models (id, vehicle_brand_id, name, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
          [m.id, m.brandId, m.name],
        );
      }
      console.log(`✅ ${models.length} vehicle models seeded/checked`);

      for (const v of variants) {
        await conn.query(
          "INSERT IGNORE INTO vehicle_variants (id, vehicle_model_id, name, drivetrain, transmission, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
          [
            v.id,
            v.modelId,
            v.name,
            v.drivetrain || null,
            v.transmission || null,
          ],
        );
      }
      console.log(`✅ ${variants.length} vehicle variants seeded/checked`);
    } else {
      console.log("⚠️ vehicles.json not found, skipping vehicle seeding");
    }

    // === UNITS OF MEASURE ===
    // The item form's "Satuan" dropdown reads this master. Without a baseline
    // the dropdown would collapse to whatever rows already exist, so seed the
    // common units (the same set the form used to hard-code). Symbols are
    // UPPERCASE to match Item.unitOfMeasure and UomConversion.code. Any symbol
    // that already exists (case-insensitive) is skipped so re-seeding is safe.
    const unitsOfMeasure = [
      { name: "Pieces", symbol: "PCS" },
      { name: "Set", symbol: "SET" },
      { name: "Kilogram", symbol: "KG" },
      { name: "Liter", symbol: "LTR" },
      { name: "Meter", symbol: "MTR" },
      { name: "Box", symbol: "BOX" },
    ];
    for (const uom of unitsOfMeasure) {
      const [existing] = await conn.query(
        "SELECT id FROM unit_of_measures WHERE UPPER(symbol) = ? LIMIT 1",
        [uom.symbol],
      );
      if (existing.length > 0) continue;
      await conn.query(
        "INSERT INTO unit_of_measures (name, symbol, is_active, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW())",
        [uom.name, uom.symbol],
      );
    }
    console.log(`✅ ${unitsOfMeasure.length} units of measure seeded/checked`);

    // === EXPENSE CATEGORIES ===
    const expenseCategories = [
      { name: "operasional", label: "Operasional", sort: 10 },
      { name: "transportasi", label: "Transportasi", sort: 20 },
      { name: "makan", label: "Makan & Minum", sort: 30 },
      { name: "utilitas", label: "Utilitas", sort: 40 },
      { name: "marketing", label: "Pemasaran", sort: 50 },
      { name: "maintenance", label: "Pemeliharaan", sort: 60 },
      { name: "csr", label: "CSR / Donasi", sort: 70 },
      { name: "perbaikan_gedung", label: "Perbaikan Gedung", sort: 80 },
      { name: "iuran_lingkungan", label: "Iuran Lingkungan", sort: 90 },
      { name: "keamanan", label: "Keamanan & Kebersihan", sort: 100 },
      { name: "pendidikan", label: "Pendidikan & Pelatihan", sort: 110 },
      { name: "perjalanan_dinas", label: "Perjalanan Dinas", sort: 120 },
      { name: "sewa", label: "Sewa", sort: 130 },
      { name: "asuransi", label: "Asuransi", sort: 140 },
      { name: "konsumsi", label: "Konsumsi", sort: 150 },
      { name: "lainnya", label: "Lainnya", sort: 999 },
    ];
    for (const cat of expenseCategories) {
      await conn.query(
        "INSERT IGNORE INTO expense_categories (name, label, sort_order, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
        [cat.name, cat.label, cat.sort],
      );
    }
    console.log(`✅ ${expenseCategories.length} expense categories seeded/checked`);

    console.log("\n🎉 Seeding completed!");
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ Seed error:", e);
  process.exit(1);
});
