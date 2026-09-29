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
  console.log("🌱 Seeding Dummy ERP Data...");

  try {
    // 1. Seed Taxes
    const [existingTax] = await conn.query("SELECT id FROM taxes WHERE name = 'PPN 11%' LIMIT 1");
    if (!existingTax) {
      await conn.query(
        `INSERT INTO taxes (name, rate, is_active, created_at, updated_at) 
         VALUES ('PPN 11%', 11.00, true, NOW(), NOW())`
      );
    }
    console.log("✅ Taxes seeded");

    // 2. Seed Payment Terms
    await conn.query(
      `INSERT IGNORE INTO payment_terms (code, name, days, is_active, created_at, updated_at) 
       VALUES 
       ('COD', 'Cash on Delivery', 0, true, NOW(), NOW()),
       ('N30', 'Net 30', 30, true, NOW(), NOW())`
    );
    console.log("✅ Payment terms seeded");

    // 3. Get Default Warehouse
    const [wh] = await conn.query("SELECT id FROM warehouses WHERE code = 'WH-0001' LIMIT 1");
    if (!wh) {
      console.error("❌ Default warehouse 'WH-0001' not found! Make sure main seed has run.");
      return;
    }
    const whId = Number(wh.id);

    // 4. Map Demo Users to default warehouse (UserWarehouse)
    const users = await conn.query("SELECT id, email FROM users");
    for (const u of users) {
      await conn.query(
        "INSERT IGNORE INTO user_warehouses (user_id, warehouse_id, created_at) VALUES (?, ?, NOW())",
        [u.id, whId]
      );
    }
    console.log(`✅ ${users.length} users mapped to WH-0001`);

    // 5. Seed Brands
    const brands = ["Honda", "Yamaha", "Toyota", "Suzuki", "Bosch"];
    for (const name of brands) {
      const [existingBrand] = await conn.query("SELECT id FROM brands WHERE name = ? LIMIT 1", [name]);
      if (!existingBrand) {
        await conn.query(
          "INSERT INTO brands (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
          [name]
        );
      }
    }
    console.log(`✅ ${brands.length} brands seeded`);

    // 6. Seed Item Categories
    const categories = ["Sparepart", "Jasa Bengkel", "Oli & Pelumas", "ATK"];
    for (const name of categories) {
      const [existingCat] = await conn.query("SELECT id FROM item_categories WHERE name = ? LIMIT 1", [name]);
      if (!existingCat) {
        await conn.query(
          "INSERT INTO item_categories (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
          [name]
        );
      }
    }
    console.log(`✅ ${categories.length} item categories seeded`);

    // Fetch Brand and Category IDs for linkage
    const brandIds: Record<string, number> = {};
    const dbBrands = await conn.query("SELECT id, name FROM brands");
    for (const b of dbBrands) {
       brandIds[b.name] = Number(b.id);
    }

    const categoryIds: Record<string, number> = {};
    const dbCategories = await conn.query("SELECT id, name FROM item_categories");
    for (const c of dbCategories) {
       categoryIds[c.name] = Number(c.id);
    }

    // 7. Seed Racks & Rack Rows in WH-0001
    const racks = [
      { name: "Rak A", code: "RCK-0001" },
      { name: "Rak B", code: "RCK-0002" },
    ];
    for (const rack of racks) {
      const rname = rack.name;
      const rcode = rack.code;
      const [rk] = await conn.query("SELECT id FROM racks WHERE warehouse_id = ? AND code = ? LIMIT 1", [whId, rcode]);
      let rkId: number;

      if (!rk) {
        await conn.query(
          "INSERT INTO racks (name, code, warehouse_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
          [rname, rcode, whId]
        );
        const [insertedRk] = await conn.query("SELECT id FROM racks WHERE warehouse_id = ? AND code = ? LIMIT 1", [whId, rcode]);
        rkId = Number(insertedRk.id);
      } else {
        rkId = Number(rk.id);
      }
      
      const rows = [
        { name: "Baris 1", code: "ROW-0001" },
        { name: "Baris 2", code: "ROW-0002" },
        { name: "Baris 3", code: "ROW-0003" },
      ];
      for (const row of rows) {
        const rowname = row.name;
        const rowcode = row.code;
        const [rr] = await conn.query("SELECT id FROM rack_rows WHERE rack_id = ? AND code = ? LIMIT 1", [rkId, rowcode]);
        if (!rr) {
          await conn.query(
            "INSERT INTO rack_rows (name, code, rack_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
            [rowname, rowcode, rkId]
          );
        }
      }
    }
    console.log("✅ Racks and rack rows seeded");

    // Fetch Rack and Rack Row IDs for item linkage
    const [defaultRack] = await conn.query("SELECT id FROM racks LIMIT 1");
    const [defaultRackRow] = await conn.query("SELECT id FROM rack_rows LIMIT 1");
    const rackId = defaultRack ? Number(defaultRack.id) : null;
    const rackRowId = defaultRackRow ? Number(defaultRackRow.id) : null;

    // 8. Seed Items
    const items = [
      { sku: "SP-0001", name: "Kampas Rem Honda", cost: 50000, price: 75000, uom: "PCS", isProduct: true, category: "Sparepart", brand: "Honda" },
      { sku: "SP-0002", name: "Busi Motor Bosch", cost: 15000, price: 25000, uom: "PCS", isProduct: true, category: "Sparepart", brand: "Bosch" },
      { sku: "OL-0001", name: "Oli Federal MPX2", cost: 45000, price: 60000, uom: "LITER", isProduct: true, category: "Oli & Pelumas", brand: "Honda" },
      { sku: "JS-0001", name: "Jasa Servis Ringan", cost: 0, price: 50000, uom: "JASA", isProduct: false, category: "Jasa Bengkel", brand: "Honda" },
      { sku: "JS-0002", name: "Jasa Servis Besar", cost: 0, price: 150000, uom: "JASA", isProduct: false, category: "Jasa Bengkel", brand: "Honda" }
    ];
    for (const it of items) {
      const catId = categoryIds[it.category] || null;
      const brId = brandIds[it.brand] || null;
      await conn.query(
        `INSERT IGNORE INTO items (sku, name, cost, price, unit_of_measure, is_product, category_id, brand_id, default_warehouse_id, default_rack_id, default_rack_row_id, is_active, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, NOW(), NOW())`,
        [it.sku, it.name, it.cost, it.price, it.uom, it.isProduct, catId, brId, whId, rackId, rackRowId]
      );
    }
    console.log(`✅ ${items.length} items seeded`);

    // 9. Seed Vendors
    const vendors = [
      { code: "VND-0001", name: "PT Astra Honda Motor", email: "info@ahm.co.id", phone: "021-50806000" },
      { code: "VND-0002", name: "PT Federal Izumi Indonesia", email: "sales@fii.co.id", phone: "021-8980700" },
      { code: "VND-0003", name: "CV Sumber Makmur", email: "sumbermakmur@gmail.com", phone: "031-789045" }
    ];
    for (const v of vendors) {
      await conn.query(
        "INSERT IGNORE INTO vendors (code, name, email, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, true, NOW(), NOW())",
        [v.code, v.name, v.email, v.phone]
      );
    }
    console.log(`✅ ${vendors.length} vendors seeded`);

    // 10. Seed Customers
    const customers = [
      { code: "CST-0001", name: "Ahmad Prasetyo", email: "ahmad@gmail.com", phone: "08123456789" },
      { code: "CST-0002", name: "Budi Santoso", email: "budi@gmail.com", phone: "08198765432" },
      { code: "CST-0003", name: "Siti Aminah", email: "siti@gmail.com", phone: "08234567890" }
    ];
    for (const c of customers) {
      const [existingCust] = await conn.query("SELECT id FROM customers WHERE code = ? LIMIT 1", [c.code]);
      if (!existingCust) {
        await conn.query(
          "INSERT INTO customers (code, name, email, phone, is_active, credit_limit, created_at, updated_at) VALUES (?, ?, ?, ?, true, 50000000.00, NOW(), NOW())",
          [c.code, c.name, c.email, c.phone]
        );
      }
    }
    console.log(`✅ ${customers.length} customers seeded`);

    // 11. Seed Projects
    const dbCustomers = await conn.query("SELECT id FROM customers LIMIT 1");
    const defaultCustomerId = dbCustomers[0] ? Number(dbCustomers[0].id) : null;

    if (defaultCustomerId) {
      const projects = [
        { documentNo: "PRJ-2026-0001", name: "Servis Berkala PT Yara", status: "active" },
        { documentNo: "PRJ-2026-0002", name: "Proyek Fabrikasi Pagar", status: "active" }
      ];
      for (const p of projects) {
        await conn.query(
          "INSERT IGNORE INTO projects (document_no, name, status, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
          [p.documentNo, p.name, p.status, defaultCustomerId]
        );
      }
      console.log(`✅ ${projects.length} projects seeded`);
    } else {
      console.log("⚠️ Skipping project seeding: No customers found.");
    }

    console.log("\n🎉 Dummy seeding completed successfully!");
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ Dummy Seeding error:", e);
  process.exit(1);
});
