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
      "post_sales_invoices",
      "delete_sales_invoices",
      "approve_sales_invoices",
      "view_sales_payments",
      "create_sales_payments",
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
      "create_vehicle_brands",
      "edit_vehicle_brands",
      "delete_vehicle_brands",
      "create_vehicle_models",
      "edit_vehicle_models",
      "delete_vehicle_models",
      "view_projects",
      "create_projects",
      "edit_projects",
      "delete_projects",
      "manage_projects",
      "view_budgets",
      "create_budgets",
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
      "delete_holidays",
      "create_loans",
      "delete_loans",
      "create_products",
      "edit_products",
      "delete_products",
      "create_production_orders",
      "delete_production_orders",
      "view_employee_loans",
      "manage_settings",
      "manage_users",
      "manage_roles",
      "manage_inventory",
      "approve_workflows",
    ];

    for (const name of permissions) {
      await conn.query(
        "INSERT IGNORE INTO permissions (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name],
      );
    }
    console.log(`✅ ${permissions.length} permissions created`);

    // Create roles
    await conn.query(
      "INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES ('super_admin', NOW(), NOW())",
    );
    await conn.query(
      "INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES ('admin', NOW(), NOW())",
    );
    await conn.query(
      "INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES ('staff', NOW(), NOW())",
    );
    console.log("✅ Roles created: super_admin, admin, staff");

    // Assign all permissions to super_admin
    const [superAdminRole] = await conn.query(
      "SELECT id FROM roles WHERE name = 'super_admin'",
    );
    const allPerms = await conn.query("SELECT id FROM permissions");
    for (const perm of allPerms) {
      await conn.query(
        "INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)",
        [perm.id, superAdminRole.id],
      );
    }

    // Assign all permissions to admin
    const [adminRole] = await conn.query(
      "SELECT id FROM roles WHERE name = 'admin'",
    );
    for (const perm of allPerms) {
      await conn.query(
        "INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)",
        [perm.id, adminRole.id],
      );
    }

    // Assign view/create permissions to staff
    const [staffRole] = await conn.query(
      "SELECT id FROM roles WHERE name = 'staff'",
    );
    const staffPerms = await conn.query(
      "SELECT id FROM permissions WHERE name LIKE 'view_%' OR name LIKE 'create_%'",
    );
    for (const perm of staffPerms) {
      await conn.query(
        "INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)",
        [perm.id, staffRole.id],
      );
    }
    console.log("✅ Permissions assigned to roles");

    // Create default super-admin user.
    // Credentials come from env so production never ships a known password.
    const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@yaraerp.app";
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || "password123";
    const usingDefaultPassword = !process.env.SEED_ADMIN_PASSWORD;
    // Stabilize hash for default password to prevent E2E session invalidation due to non-deterministic salts on different runners.
    const hashedPassword = usingDefaultPassword
      ? "$2b$12$9xrLycAwOhmZKQRhnkKJUOpE1UZzoQbT1qjDtJaznL0lMVzoKU.5i"
      : await bcrypt.hash(adminPassword, 12);
    await conn.query(
      `INSERT IGNORE INTO users (name, email, password, is_active, created_at, updated_at) 
       VALUES ('Super Admin', ?, ?, true, NOW(), NOW())`,
      [adminEmail, hashedPassword],
    );
    const [adminUser] = await conn.query(
      "SELECT id FROM users WHERE email = ?",
      [adminEmail],
    );
    await conn.query("INSERT IGNORE INTO _UserRoles (A, B) VALUES (?, ?)", [
      superAdminRole.id,
      adminUser.id,
    ]);
    console.log(`✅ Default user created: ${adminEmail}`);
    if (usingDefaultPassword) {
      console.warn(
        "PERINGATAN: admin memakai password default 'password123'. " +
          "WAJIB diganti, atau set SEED_ADMIN_PASSWORD sebelum seed di produksi.",
      );
    }

    // Create system settings
    await conn.query(
      `INSERT IGNORE INTO system_settings (id, company_name, company_email, costing_method, fiscal_year_start_month, currency_code, currency_symbol, created_at, updated_at)
       VALUES (1, 'Yara ERP', 'admin@yaraerp.app', 'FIFO', 1, 'IDR', 'Rp ', NOW(), NOW())`,
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
       VALUES ('WH-MAIN', 'Gudang Utama', 'Jl. Industri No. 1', true, NOW(), NOW())`,
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
    }
    console.log("✅ Positions created");

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
