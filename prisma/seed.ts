import { createPool } from "mariadb"
import bcrypt from "bcryptjs"

function buildPoolConfig() {
  const fallback = {
    socketPath: "/tmp/mysql.sock",
    user: "root",
    password: "",
    database: "yara_erp",
    connectionLimit: 5,
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return fallback

  try {
    const parsed = new URL(databaseUrl)
    const socketPath = parsed.searchParams.get("socketPath") || parsed.searchParams.get("socket")
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "yara_erp"
    const user = decodeURIComponent(parsed.username || "root")
    const password = decodeURIComponent(parsed.password || "")
    const connectionLimit = Number(parsed.searchParams.get("connectionLimit") || 5)

    if (socketPath) {
      return { socketPath, user, password, database, connectionLimit }
    }

    return {
      host: parsed.hostname || "127.0.0.1",
      port: parsed.port ? Number(parsed.port) : 3306,
      user,
      password,
      database,
      connectionLimit,
    }
  } catch {
    return fallback
  }
}

const pool = createPool(buildPoolConfig())

async function main() {
  const conn = await pool.getConnection()
  console.log("🌱 Seeding database...")

  try {
    // Create permissions
    const permissions = [
      "view_dashboard",
      "view_customers", "create_customers", "edit_customers", "delete_customers",
      "view_vendors", "create_vendors", "edit_vendors", "delete_vendors",
      "view_items", "create_items", "edit_items", "delete_items",
      "view_warehouses", "create_warehouses", "edit_warehouses",
      "view_employees", "create_employees", "edit_employees",
      "view_accounts", "create_accounts", "edit_accounts",
      "view_quotations", "create_quotations", "edit_quotations",
      "view_sales_orders", "create_sales_orders",
      "view_sales_invoices", "create_sales_invoices", "post_sales_invoices",
      "view_sales_payments", "create_sales_payments",
      "view_sales_returns", "create_sales_returns",
      "view_down_payments", "confirm_down_payments",
      "view_purchase_requests", "create_purchase_requests", "approve_purchase_requests",
      "view_purchase_orders", "create_purchase_orders", "approve_purchase_orders",
      "view_goods_receipts", "create_goods_receipts", "verify_goods_receipts",
      "view_purchase_returns", "create_purchase_returns",
      "view_stock_moves",
      "view_stock_adjustments", "create_stock_adjustments", "process_stock_adjustments",
      "view_inventory_transfers", "create_inventory_transfers",
      "view_material_issues", "create_material_issues",
      "view_work_orders", "create_work_orders", "complete_work_orders",
      "view_attendance", "manage_attendance",
      "view_leave_requests", "approve_leave_requests",
      "view_overtime", "approve_overtime",
      "view_payroll", "process_payroll",
      "view_journals", "create_journals", "post_journals",
      "view_expenses", "create_expenses", "approve_expenses",
      "view_petty_cash", "create_petty_cash",
      "view_bank_reconciliation", "manage_bank_reconciliation",
      "view_reports",
      "view_leads", "create_leads",
      "view_tickets", "create_tickets",
      "view_assets", "create_assets", "manage_assets",
      "manage_settings", "manage_users", "manage_roles",
    ]

    for (const name of permissions) {
      await conn.query(
        "INSERT IGNORE INTO permissions (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name]
      )
    }
    console.log(`✅ ${permissions.length} permissions created`)

    // Create roles
    await conn.query("INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES ('super_admin', NOW(), NOW())")
    await conn.query("INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES ('admin', NOW(), NOW())")
    await conn.query("INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES ('staff', NOW(), NOW())")
    console.log("✅ Roles created: super_admin, admin, staff")

    // Assign all permissions to super_admin
    const [superAdminRole] = await conn.query("SELECT id FROM roles WHERE name = 'super_admin'")
    const allPerms = await conn.query("SELECT id FROM permissions")
    for (const perm of allPerms) {
      await conn.query(
        "INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)",
        [perm.id, superAdminRole.id]
      )
    }

    // Assign all permissions to admin
    const [adminRole] = await conn.query("SELECT id FROM roles WHERE name = 'admin'")
    for (const perm of allPerms) {
      await conn.query(
        "INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)",
        [perm.id, adminRole.id]
      )
    }

    // Assign view/create permissions to staff
    const [staffRole] = await conn.query("SELECT id FROM roles WHERE name = 'staff'")
    const staffPerms = await conn.query("SELECT id FROM permissions WHERE name LIKE 'view_%' OR name LIKE 'create_%'")
    for (const perm of staffPerms) {
      await conn.query(
        "INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)",
        [perm.id, staffRole.id]
      )
    }
    console.log("✅ Permissions assigned to roles")

    // Create default user
    const hashedPassword = await bcrypt.hash("password123", 12)
    await conn.query(
      `INSERT IGNORE INTO users (name, email, password, is_active, created_at, updated_at) 
       VALUES ('Super Admin', 'admin@yaraerp.co.id', ?, true, NOW(), NOW())`,
      [hashedPassword]
    )
    const [adminUser] = await conn.query("SELECT id FROM users WHERE email = 'admin@yaraerp.co.id'")
    await conn.query(
      "INSERT IGNORE INTO _UserRoles (A, B) VALUES (?, ?)",
      [superAdminRole.id, adminUser.id]
    )
    console.log("✅ Default user created: admin@yaraerp.co.id / password123")

    // Create system settings
    await conn.query(
      `INSERT IGNORE INTO system_settings (id, company_name, company_email, costing_method, fiscal_year_start_month, currency_code, currency_symbol, created_at, updated_at)
       VALUES (1, 'Yara ERP', 'admin@yaraerp.co.id', 'FIFO', 1, 'IDR', 'Rp ', NOW(), NOW())`
    )
    console.log("✅ System settings created")

    // Create Chart of Accounts
    const accounts = [
      ["1000", "Kas & Bank", "ASSET"],
      ["1100", "Piutang Usaha", "ASSET"],
      ["1200", "Persediaan", "ASSET"],
      ["1300", "Aset Tetap", "ASSET"],
      ["1400", "PPN Masukan", "ASSET"],
      ["1500", "Barang Dalam Proses (WIP)", "ASSET"],
      ["1600", "Penyesuaian Persediaan", "EXPENSE"],
      ["2000", "Hutang Usaha", "LIABILITY"],
      ["2100", "Hutang Pajak", "LIABILITY"],
      ["2200", "PPN Keluaran", "LIABILITY"],
      ["3000", "Modal", "EQUITY"],
      ["4000", "Pendapatan Penjualan", "REVENUE"],
      ["4100", "Pendapatan Lain-lain", "REVENUE"],
      ["4200", "Retur Penjualan", "REVENUE"],
      ["5000", "Harga Pokok Penjualan", "EXPENSE"],
      ["5100", "Beban Operasional", "EXPENSE"],
      ["5200", "Beban Gaji", "EXPENSE"],
      ["5300", "Beban Penyusutan", "EXPENSE"],
      ["5400", "Beban Material", "EXPENSE"],
      ["5500", "Kas Kecil", "ASSET"],
    ]

    for (const [code, name, type] of accounts) {
      await conn.query(
        "INSERT IGNORE INTO accounts (code, name, type, is_active, created_at, updated_at) VALUES (?, ?, ?, true, NOW(), NOW())",
        [code, name, type]
      )
    }
    console.log(`✅ ${accounts.length} accounts created`)

    // Create default warehouse
    await conn.query(
      `INSERT IGNORE INTO warehouses (code, name, address, is_active, created_at, updated_at)
       VALUES ('WH-MAIN', 'Gudang Utama', 'Jl. Industri No. 1', true, NOW(), NOW())`
    )
    console.log("✅ Default warehouse created")

    // Create departments
    const departments = ["Operasional", "Keuangan", "HRD", "Marketing", "IT"]
    for (const name of departments) {
      await conn.query(
        "INSERT IGNORE INTO departments (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name]
      )
    }
    console.log("✅ Departments created")

    // Create positions
    const positions = ["Manager", "Supervisor", "Staff", "Admin", "Direktur"]
    for (const name of positions) {
      await conn.query(
        "INSERT IGNORE INTO positions (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name]
      )
    }
    console.log("✅ Positions created")

    // Create document sequences
    const sequences = ["QUO", "SO", "INV", "PAY", "PO", "GR", "PR", "WO", "ADJ", "TRF", "MI", "EXP", "PC"]
    for (const key of sequences) {
      await conn.query(
        "INSERT IGNORE INTO document_sequences (`key`, current_value, created_at, updated_at) VALUES (?, 0, NOW(), NOW())",
        [key]
      )
    }
    console.log("✅ Document sequences created")

    console.log("\n🎉 Seeding completed!")
  } finally {
    conn.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error("❌ Seed error:", e)
  process.exit(1)
})
