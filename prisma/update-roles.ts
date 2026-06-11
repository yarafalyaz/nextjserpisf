import { createPool } from "mariadb";

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
  console.log("🌱 Updating roles and permissions...");

  try {
    // 1. Create permissions if missing
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
      "view_warehouses",
      "create_warehouses",
      "edit_warehouses",
      "delete_warehouses",
      "view_employees",
      "create_employees",
      "edit_employees",
      "delete_employees",
      "view_quotations",
      "create_quotations",
      "edit_quotations",
      "delete_quotations",
      "confirm_quotations",
      "approve_quotations",
      "view_work_orders",
      "create_work_orders",
      "edit_work_orders",
      "complete_work_orders",
      "delete_work_orders",
      "view_material_issues",
      "create_material_issues",
      "edit_material_issues",
      "delete_material_issues",
      "view_attendance",
      "create_attendance",
      "manage_attendance",
      "view_payroll",
      "view_petty_cash",
      "create_petty_cash",
      "delete_petty_cash",
      "view_purchase_requests",
      "create_purchase_requests",
      "view_purchase_orders",
      "create_purchase_orders",
      "edit_purchase_orders",
      "delete_purchase_orders",
      "view_goods_receipts",
      "create_goods_receipts",
      "verify_goods_receipts",
      "delete_goods_receipts",
      "view_inventory_transfers",
      "create_inventory_transfers",
      "view_stock_moves",
      "view_stock_adjustments",
      "create_stock_adjustments",
      "process_stock_adjustments",
      "view_expenses",
      "create_expenses",
      "approve_overtime_requests",
      "create_leave_requests",
      "view_leave_requests",
      "view_timesheets",
      "create_timesheets",
      "view_assets",
      "manage_roles",
      "manage_settings",
      "manage_users"
    ];

    for (const name of permissions) {
      await conn.query(
        "INSERT IGNORE INTO permissions (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name]
      );
    }

    // 2. Create Roles
    const roles = [
      "super_admin",
      "admin",
      "ga",
      "kepala_bengkel",
      "karyawan",
      "purchasing",
      "warehouse"
    ];

    for (const role of roles) {
      await conn.query(
        "INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [role]
      );
    }

    // Helper to clear existing role-perms before re-assigning (optional, let's just INSERT IGNORE)
    const getRoleId = async (name: string) => {
      const res = await conn.query("SELECT id FROM roles WHERE name = ?", [name]);
      return res[0].id;
    };

    const assignPerms = async (roleName: string, permPatterns: string[]) => {
      const roleId = await getRoleId(roleName);

      // If patterns contain wildcards, we use LIKE
      if (permPatterns.some(p => p.includes("%"))) {
        const clauses = permPatterns.map(() => "name LIKE ?").join(" OR ");
        const perms = await conn.query(`SELECT id FROM permissions WHERE ${clauses}`, permPatterns);
        for (const p of perms) {
          await conn.query("INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)", [p.id, roleId]);
        }
      } else {
        const perms = await conn.query("SELECT id FROM permissions WHERE name IN (?)", [permPatterns]);
        for (const p of perms) {
          await conn.query("INSERT IGNORE INTO _RolePermissions (A, B) VALUES (?, ?)", [p.id, roleId]);
        }
      }
    };

    // 3. Assign Permissions
    
    // GA: Petty Cash, Quotation (create/view), support stuff
    await assignPerms("ga", [
      "view_dashboard", "view_petty_cash", "create_petty_cash", "delete_petty_cash",
      "view_quotations", "create_quotations", "edit_quotations",
      "view_items", "view_employees", "view_assets", "create_expenses"
    ]);

    // Kepala Bengkel: Work Order, Inventory view, Material Issue, Team Attendance
    await assignPerms("kepala_bengkel", [
      "view_dashboard", "view_items",
      "view_work_orders", "create_work_orders", "edit_work_orders", "complete_work_orders",
      "view_stock_moves", "view_warehouses", "view_material_issues", "create_material_issues",
      "manage_attendance", "approve_overtime_requests"
    ]);

    // Karyawan: Self service, View products
    await assignPerms("karyawan", [
      "view_items", "view_attendance", "create_attendance",
      "view_timesheets", "create_timesheets", "create_leave_requests", "view_leave_requests",
      "view_payroll"
    ]);

    // Purchasing: Vendors, PR, PO + Item management (create/edit)
    await assignPerms("purchasing", [
      "view_dashboard", "view_vendors", "create_vendors", "edit_vendors", "delete_vendors",
      "view_purchase_requests", "create_purchase_requests",
      "view_purchase_orders", "create_purchase_orders", "edit_purchase_orders", "delete_purchase_orders",
      "view_items", "create_items", "edit_items", "delete_items"
    ]);

    // Warehouse: Inbound, Outbound, Stock Opname, Item view
    await assignPerms("warehouse", [
      "view_dashboard", "view_items",
      "view_goods_receipts", "create_goods_receipts", "verify_goods_receipts", "delete_goods_receipts",
      "view_inventory_transfers", "create_inventory_transfers", "view_stock_moves",
      "view_stock_adjustments", "create_stock_adjustments", "process_stock_adjustments", "delete_stock_adjustments",
      "view_material_issues", "create_material_issues", "edit_material_issues", "delete_material_issues"
    ]);

    console.log("✅ Roles & Permissions updated successfully");

  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
