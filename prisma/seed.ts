import { createPool, type PoolConnection } from "mariadb";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { seedModules } from "../src/lib/setup/modules";
import { NATIONAL_HOLIDAYS } from "../src/lib/setup/national-holidays";
import { wibDateToUtcMidnight } from "../src/lib/utils/attendance-time";
import {
  PERMISSIONS,
  ROLES,
  ADMIN_WHITELIST,
  STAFF_WHITELIST,
  GA_WHITELIST,
  KABENG_WHITELIST,
  KARYAWAN_WHITELIST,
  PURCHASING_WHITELIST,
  WAREHOUSE_WHITELIST,
  FINANCE_WHITELIST,
  CHART_OF_ACCOUNTS,
  ACCURATE_TYPE_TO_ACCOUNT_TYPE,
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  DOCUMENT_SEQUENCE_KEYS,
  UNITS_OF_MEASURE,
  EXPENSE_CATEGORIES,
  DEPARTMENTS,
  POSITIONS,
  WITHHOLDING_TAX_TYPES,
} from "../src/lib/setup/base-data";
import {
  INSTALL_SLUG_SOURCES,
  SLUG_COLUMN_QUERY,
  slugBackfillSql,
  slugTablesFromRows,
} from "../src/lib/setup/slug-backfill";
import { buildPoolConfig } from "./seed-pool-config";

const pool = createPool(buildPoolConfig());

/**
 * Derive and store a slug for every seeded row that does not have one yet.
 *
 * Rows created here used to stay on a NULL slug, so every link fell back to the
 * numeric id (`/pengaturan/peran/2/ubah`); this post-pass gives them the
 * human-readable URL instead. Idempotent: the `slug IS NULL` guard leaves rows
 * the app already slugged alone, so re-running is safe.
 */
async function backfillSeededSlugs(conn: PoolConnection) {
  const present = slugTablesFromRows(await conn.query(SLUG_COLUMN_QUERY));

  let slugged = 0;
  for (const table of Object.keys(INSTALL_SLUG_SOURCES)) {
    if (!present.has(table)) continue;

    const sql = slugBackfillSql(table);
    if (!sql) continue;

    const result = (await conn.query(sql)) as { affectedRows?: number | bigint };
    slugged += Number(result?.affectedRows ?? 0);
  }

  console.log(`✅ ${slugged} slugs backfilled across seeded tables`);
}

async function main() {
  const conn = await pool.getConnection();
  console.log("🌱 Seeding database...");

  try {
    // Create permissions

    for (const name of PERMISSIONS) {
      await conn.query(
        "INSERT IGNORE INTO permissions (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name],
      );
    }
    console.log(`✅ ${PERMISSIONS.length} permissions created`);

    // Create roles
    for (const name of ROLES) {
      await conn.query(
        "INSERT IGNORE INTO roles (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [name],
      );
    }
    console.log(`✅ ${ROLES.length} roles created/ensured`);

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
    await assignPermissionsToRole("admin", ADMIN_WHITELIST);
    await assignPermissionsToRole("staff", STAFF_WHITELIST);
    await assignPermissionsToRole("ga", GA_WHITELIST);
    await assignPermissionsToRole("kepala_bengkel", KABENG_WHITELIST);
    await assignPermissionsToRole("karyawan", KARYAWAN_WHITELIST);
    await assignPermissionsToRole("purchasing", PURCHASING_WHITELIST);
    await assignPermissionsToRole("warehouse", WAREHOUSE_WHITELIST);
    await assignPermissionsToRole("finance", FINANCE_WHITELIST);

    console.log("✅ All roles whitelists successfully mapped");

    // Workflow persetujuan bawaan untuk dokumen uang sensitif (jurnal manual
    // + pembayaran vendor): satu langkah oleh peran finance. Idempoten:
    // hanya dibuat bila model itu belum punya workflow aktif, dan langkah
    // hanya ditambah bila workflow belum punya langkah sama sekali, jadi
    // konfigurasi tenant yang sudah diedit lewat UI tidak ditimpa seed.
    const financeRoleId = roleIdByName.get("finance");
    const defaultWorkflows = [
      { name: "Persetujuan Jurnal Manual", code: "APR-JRN", modelType: "Journal" },
      { name: "Persetujuan Pembayaran Vendor", code: "APR-VPAY", modelType: "VendorPayment" },
    ];
    for (const wf of defaultWorkflows) {
      await conn.query(
        `INSERT INTO approval_workflows (name, code, model_type, is_active, created_at, updated_at)
         SELECT ?, ?, ?, 1, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM approval_workflows
           WHERE model_type = ? AND is_active = 1 AND deleted_at IS NULL
         )`,
        [wf.name, wf.code, wf.modelType, wf.modelType],
      );
      if (financeRoleId) {
        const wfRows = await conn.query(
          `SELECT id FROM approval_workflows
           WHERE model_type = ? AND is_active = 1 AND deleted_at IS NULL
           ORDER BY priority DESC LIMIT 1`,
          [wf.modelType],
        );
        const wfId = wfRows[0] ? Number(wfRows[0].id) : null;
        if (wfId) {
          await conn.query(
            `INSERT INTO approval_workflow_steps (workflow_id, name, step_order, role_id, created_at, updated_at)
             SELECT ?, 'Persetujuan Finance', 1, ?, NOW(), NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM approval_workflow_steps WHERE workflow_id = ?
             )`,
            [wfId, financeRoleId, wfId],
          );
        }
      }
    }
    console.log("✅ Default approval workflows ensured (Journal, VendorPayment)");

    // Hari libur nasional (SKB 3 Menteri): idempoten per (tanggal, nama),
    // disimpan tengah malam WIB persis seperti createHoliday. Tanpa baris
    // ini penghitung cuti menganggap tanggal merah sebagai hari kerja.
    for (const h of NATIONAL_HOLIDAYS) {
      await conn.query(
        `INSERT INTO holidays (name, date, created_at, updated_at)
         SELECT ?, ?, NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM holidays WHERE date = ? AND name = ?)`,
        [h.name, wibDateToUtcMidnight(h.date), wibDateToUtcMidnight(h.date), h.name],
      );
    }
    console.log(`✅ National holidays ensured (${NATIONAL_HOLIDAYS.length} entries)`);

    // Create system settings
    await conn.query(
      `INSERT IGNORE INTO system_settings (id, company_name, company_email, costing_method, fiscal_year_start_month, currency_code, currency_symbol, created_at, updated_at)
       VALUES (1, 'Yara ERP', 'admin@erp.yarasoft.net', 'FIFO', 1, 'IDR', 'Rp ', NOW(), NOW())`,
    );
    console.log("✅ System settings created");

    // Create Chart of Accounts — induk lebih dulu, lalu anak menempel ke induknya
    // (raw SQL agar seed CLI tidak bergantung pada Prisma Client versi terbaru).
    const roots = CHART_OF_ACCOUNTS.filter(([, , , parent]) => !parent);
    const children = CHART_OF_ACCOUNTS.filter(([, , , parent]) => Boolean(parent));

    for (const [code, name, reportGroup] of roots) {
      await conn.query(
        "INSERT IGNORE INTO accounts (code, name, type, report_group, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, true, NOW(), NOW())",
        [code, name, ACCURATE_TYPE_TO_ACCOUNT_TYPE[reportGroup], reportGroup],
      );
    }
    for (const [code, name, reportGroup, parentCode] of children) {
      await conn.query(
        `INSERT IGNORE INTO accounts (code, name, type, report_group, parent_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, (SELECT id FROM (SELECT id FROM accounts WHERE code = ?) AS p), true, NOW(), NOW())`,
        [code, name, ACCURATE_TYPE_TO_ACCOUNT_TYPE[reportGroup], reportGroup, parentCode],
      );
    }
    console.log(`✅ ${CHART_OF_ACCOUNTS.length} accounts created (${roots.length} induk + ${children.length} anak)`);

    // Jenis potongan PPh bawaan tertaut akun COA (setara seedWithholdingTaxTypes
    // di wizard install). Hanya mengisi bila kode belum ada — edit tenant aman.
    for (const t of WITHHOLDING_TAX_TYPES) {
      await conn.query(
        `INSERT INTO withholding_tax_types (code, name, rate, article, object_code, liability_account_id, receivable_account_id, is_active, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, (SELECT id FROM accounts WHERE code = ?), (SELECT id FROM accounts WHERE code = ?), ?, NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM withholding_tax_types WHERE code = ?)`,
        [t.code, t.name, t.rate, t.article ?? null, t.objectCode ?? null, t.liabilityAccountCode ?? null, t.receivableAccountCode ?? null, t.isActive ?? true, t.code],
      );
    }
    console.log(`✅ ${WITHHOLDING_TAX_TYPES.length} withholding tax types seeded/checked`);

    // Parameter statutori payroll 12 baris vonis F-2026-10-28-126-V §3
    // (pecahan tarif + plafon JP berperiode + PTKP + biaya jabatan).
    // Idempoten per (key, effective_from): edit/tutup tenant tidak ditimpa.
    // Baris lama migrasi P1-6 (effective_from 2024-01-01) ikut ditutup agar
    // getStatutoryParams tak jatuh ke fallback — hanya bila masih NULL.
    // Tanpa ini hitung/approve payroll tertahan gate fromFallback.
    const statutoryRows: [string, number, string, string | null, string][] = [
      ["bpjs_health_employee_rate", 0.01, "2020-07-01", null, "Perpres 64/2020"],
      ["bpjs_health_ceiling", 12000000, "2020-07-01", null, "Perpres 64/2020"],
      ["bpjs_jht_employee_rate", 0.02, "2015-07-01", null, "PP 46/2015"],
      ["bpjs_jp_employee_rate", 0.01, "2015-07-01", null, "PP 45/2015"],
      ["bpjs_jp_ceiling", 10042300, "2024-03-01", "2025-02-28", "surat BPJS (plafon 2024)"],
      ["bpjs_jp_ceiling", 10547400, "2025-03-01", "2026-02-28", "surat BPJS B/91/022025"],
      ["bpjs_jp_ceiling", 11086300, "2026-03-01", null, "surat BPJS B/962/022026"],
      ["ptkp_single", 54000000, "2016-01-01", null, "PMK 101/PMK.010/2016"],
      ["ptkp_married_extra", 4500000, "2016-01-01", null, "PMK 101/PMK.010/2016"],
      ["ptkp_dependent_extra", 4500000, "2016-01-01", null, "PMK 101/PMK.010/2016"],
      ["occupational_cost_rate", 0.05, "2009-01-01", null, "PMK 250/PMK.03/2008"],
      ["occupational_cost_ceiling_year", 6000000, "2009-01-01", null, "PMK 250/PMK.03/2008"],
    ];
    for (const [key, value, from, to, source] of statutoryRows) {
      await conn.query(
        `INSERT INTO payroll_statutory_rules (\`key\`, value, effective_from, effective_to, source)
         SELECT ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM payroll_statutory_rules WHERE \`key\` = ? AND effective_from = ?
         )`,
        [key, value, from, to, source, key, from],
      );
    }
    await conn.query(
      `UPDATE payroll_statutory_rules SET effective_to = '2024-02-29', source = 'surat BPJS (plafon 2024)'
       WHERE \`key\` = 'bpjs_jp_ceiling' AND effective_from = '2024-01-01' AND effective_to IS NULL`,
    );
    console.log(`✅ ${statutoryRows.length} payroll statutory rules seeded/checked`);

    // Komisi penjualan: akun sistem diselesaikan dari COA ter-seed
    // (600002 Beban Komisi / 210212 Utang Komisi Penjualan, pola
    // account-automap) HANYA bila masih NULL — setting tenant yang sudah
    // diisi lewat UI tidak ditimpa. Tanpa akun ini jurnal komisi
    // fail-closed (commission-payable.service).
    await conn.query(
      `UPDATE system_settings SET
         commission_expense_account_id = COALESCE(commission_expense_account_id, (SELECT id FROM accounts WHERE code = '600002')),
         commission_payable_account_id = COALESCE(commission_payable_account_id, (SELECT id FROM accounts WHERE code = '210212')),
         updated_at = NOW()
       WHERE id = 1`,
    );
    console.log("✅ Commission system accounts ensured (600002/210212, NULL-only)");

    // Master komponen gaji "Komisi Penjualan": dicari fail-closed oleh
    // addPayrollCommissionLine (normalized_name 'komisi penjualan',
    // earning, kena pajak, aktif). recurrence 'variable' (bayar per slip,
    // bukan komponen tetap). Idempoten per normalized_name aktif —
    // pola assertActiveComponentNameAvailable; akun komponen diarahkan
    // ke Beban Komisi bila akunnya ada.
    await conn.query(
      `INSERT INTO payroll_components (name, normalized_name, kind, recurrence, is_taxable, account_id, is_active, created_at, updated_at)
       SELECT 'Komisi Penjualan', 'komisi penjualan', 'earning', 'variable', 1,
              (SELECT id FROM accounts WHERE code = '600002'), 1, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM payroll_components
         WHERE normalized_name = 'komisi penjualan' AND is_active = 1
       )`,
    );
    console.log("✅ Payroll component 'Komisi Penjualan' ensured");

    // Create default warehouse
    await conn.query(
      `INSERT IGNORE INTO warehouses (code, name, address, is_active, created_at, updated_at)
       VALUES ('WH-0001', 'Gudang Utama', 'Jl. Industri No. 1', true, NOW(), NOW())`,
    );
    console.log("✅ Default warehouse created");

    // Create departments (current org structure)
    // Codes follow the auto-generated DEPT-#### scheme.
    const departmentIdByName: Record<string, number> = {};
    for (const [code, name] of DEPARTMENTS) {
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
    const positionIdByName: Record<string, number> = {};
    for (const [code, name, deptName] of POSITIONS) {
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
    // Guard: kredensial demo berkekuatan rendah — hanya jalan bila operator
    // eksplisit mengizinkan (ALLOW_DEMO_SEED=true) DAN memberi password admin
    // via SEED_ADMIN_PASSWORD. Tanpa guard = gagal keras sebelum user apapun
    // dibuat/diubah; user yang sudah ada tak disentuh bila guard off.
    console.log("🌱 Seeding demo users and employees...");
    if (process.env.ALLOW_DEMO_SEED !== "true") {
      console.log("⏭️ Demo-user seeding dilewati (ALLOW_DEMO_SEED != true) — password yang ada tidak diubah.");
    } else if (!process.env.SEED_ADMIN_PASSWORD) {
      throw new Error("SEED_ADMIN_PASSWORD wajib diisi bila ALLOW_DEMO_SEED=true.");
    } else {
    const DEMO_PASSWORD_HASH = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12);

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
        email: "admin.dewi@isf.co.id",
        roleName: "admin",
        employeeNo: "EMP-00002",
        departmentName: "Kantor",
        positionName: "Admin Keuangan",
        baseSalary: 7000000.00
      },
      {
        name: "Siti Staff",
        email: "staff@isf.co.id",
        roleName: "staff",
        employeeNo: "EMP-00003",
        departmentName: "Kantor",
        positionName: "Admin Keuangan",
        baseSalary: 5500000.00
      },
      {
        name: "Gani GA",
        email: "ga@isf.co.id",
        roleName: "ga",
        employeeNo: "EMP-00004",
        departmentName: "Kantor",
        positionName: "General Affair",
        baseSalary: 6000000.00
      },
      {
        name: "Bambang Kabeng",
        email: "kabeng@isf.co.id",
        roleName: "kepala_bengkel",
        employeeNo: "EMP-00005",
        departmentName: "Lapangan",
        positionName: "Kepala Bengkel",
        baseSalary: 8500000.00
      },
      {
        name: "Karyawan Demo",
        email: "karyawan@isf.co.id",
        roleName: "karyawan",
        employeeNo: "EMP-00006",
        departmentName: "Lapangan",
        positionName: "Helper",
        baseSalary: 4500000.00
      },
      {
        name: "Putri Purchasing",
        email: "pembelian@isf.co.id",
        roleName: "purchasing",
        employeeNo: "EMP-00007",
        departmentName: "Kantor",
        positionName: "Gudang & Pembelian",
        baseSalary: 6500000.00
      },
      {
        name: "Wawan Warehouse",
        email: "gudang@isf.co.id",
        roleName: "warehouse",
        employeeNo: "EMP-00008",
        departmentName: "Lapangan",
        positionName: "Gudang & Pembelian",
        baseSalary: 6000000.00
      },
      {
        name: "Fani Finance",
        email: "keuangan@isf.co.id",
        roleName: "finance",
        employeeNo: "EMP-00009",
        departmentName: "Kantor",
        positionName: "Admin Keuangan",
        baseSalary: 7500000.00
      }
    ];

    for (const demo of demoUsers) {
      const hashedPassword = DEMO_PASSWORD_HASH;

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
    }

    // Create default payment methods (codes follow the auto-generated MTP- scheme)
    for (const [code, name] of PAYMENT_METHODS) {
      await conn.query(
        "INSERT IGNORE INTO payment_methods (code, name, is_active, created_at, updated_at) VALUES (?, ?, true, NOW(), NOW())",
        [code, name],
      );
    }
    console.log("✅ Payment methods created");

    // Create default shipping methods (codes follow the auto-generated MTK- scheme)
    for (const [code, name] of SHIPPING_METHODS) {
      await conn.query(
        "INSERT IGNORE INTO shipping_methods (code, name, is_active, created_at, updated_at) VALUES (?, ?, true, NOW(), NOW())",
        [code, name],
      );
    }
    console.log("✅ Shipping methods created");

    // Create document sequences
    for (const key of DOCUMENT_SEQUENCE_KEYS) {
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
    const unitsOfMeasure = UNITS_OF_MEASURE;
    for (const uom of unitsOfMeasure) {
      const existing = await conn.query(
        "SELECT id FROM unit_of_measures WHERE UPPER(symbol) = ? LIMIT 1",
        [uom.symbol],
      );
      if (existing.length > 0) continue;
      await conn.query(
        "INSERT INTO unit_of_measures (name, symbol, category, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())",
        [uom.name, uom.symbol, uom.category ?? "barang"],
      );
    }
    console.log(`✅ ${unitsOfMeasure.length} units of measure seeded/checked`);

    // === EXPENSE CATEGORIES ===
    // Kategori umum + kategori granular yang benar-benar dipakai tim keuangan
    // (diambil dari JURNAL OPERASIONAL — "Analisis Dokumen Sample Operasional").
    for (const cat of EXPENSE_CATEGORIES) {
      await conn.query(
        "INSERT IGNORE INTO expense_categories (name, label, sort_order, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
        [cat.name, cat.label, cat.sort],
      );
    }
    console.log(`✅ ${EXPENSE_CATEGORIES.length} expense categories seeded/checked`);

    // === SLUGS ===
    // Keep fresh installs off numeric-id URLs. Runs last so every seeded table
    // has its rows in place, and only fills rows that still have a NULL slug.
    await backfillSeededSlugs(conn);

    // === RBAC CATALOG ===
    // `modules` + `module_actions` menggerakkan matriks izin di Pengaturan → Peran,
    // jadi katalog harus terisi di jalur seed demo juga — dulu hanya wizard install
    // yang mengisinya, sehingga instalasi hasil seed punya katalog kosong.
    const rbacUrl = process.env.DATABASE_URL;
    if (!rbacUrl) {
      throw new Error("DATABASE_URL wajib diisi untuk menulis katalog RBAC");
    }
    const rbac = new PrismaClient({ adapter: new PrismaMariaDb(rbacUrl) });
    try {
      const { modules, actions, pruned } = await seedModules(rbac);
      console.log(
        `✅ RBAC catalog: ${modules} modules, ${actions} module actions, ${pruned} baris usang dihapus`,
      );
    } finally {
      await rbac.$disconnect();
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
