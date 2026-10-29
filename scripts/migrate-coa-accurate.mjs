#!/usr/bin/env node
/**
 * Migrasi bagan akun ke COA standar (ekspor Accurate Online).
 *
 * Aman dijalankan pada database yang sudah berjalan:
 *   1. Akun lama yang punya penerus (1:1) di-RENAME di tempat → id-nya tetap,
 *      sehingga seluruh referensi (jurnal, beban, aset, pengaturan) tidak putus.
 *   2. Akun lama yang digabung/dibuang: semua kolom yang mereferensikan
 *      accounts.id dipindahkan ke akun tujuan (ditemukan otomatis dari
 *      information_schema), lalu baris lamanya dihapus.
 *   3. Akun standar yang belum ada ditambahkan (induk lebih dulu → parent_id terisi).
 *   4. Pemetaan akun pada system_settings diarahkan ulang ke kode standar.
 *
 * Pemakaian:
 *   node scripts/migrate-coa-accurate.mjs --dry-run   (lihat rencana, tanpa perubahan)
 *   node scripts/migrate-coa-accurate.mjs             (jalankan)
 */
import mariadb from "mariadb"

const DRY_RUN = process.argv.includes("--dry-run")

/** [kode, nama, tipe akun Accurate, kode induk] */
const ACCOUNTS = [
  [
    "120006",
    "Akumulasi Depresiasi Aset Tetap",
    "DEPR",
    null
  ],
  [
    "12000601",
    "Akumulasi Penyusutan Gedung",
    "DEPR",
    "120006"
  ],
  [
    "12000604",
    "Akumulasi Penyusutan Inventaris Kantor",
    "DEPR",
    "120006"
  ],
  [
    "12000602",
    "Akumulasi Penyusutan Kendaraan",
    "DEPR",
    "120006"
  ],
  [
    "12000603",
    "Akumulasi Penyusutan Peralatan",
    "DEPR",
    "120006"
  ],
  [
    "1105",
    "Aset Lancar Lainnya",
    "OCAS",
    null
  ],
  [
    "1200",
    "Aset Tetap",
    "FASS",
    null
  ],
  [
    "110503",
    "Asuransi Dibayar Dimuka",
    "OCAS",
    "1105"
  ],
  [
    "1101",
    "Kas & Bank",
    "BANK",
    null
  ],
  [
    "110102",
    "Bank",
    "BANK",
    "1101"
  ],
  [
    "7200",
    "Beban Diluar Usaha",
    "OEXP",
    null
  ],
  [
    "720002",
    "Beban Adm. Bank & Buku Cek/Giro",
    "OEXP",
    "7200"
  ],
  [
    "6000",
    "Beban Operasional",
    "EXPS",
    null
  ],
  [
    "600009",
    "Beban Asuransi Karyawan",
    "EXPS",
    "6000"
  ],
  [
    "600003",
    "Beban Bensin, Parkir, Tol Kendaraan",
    "EXPS",
    "6000"
  ],
  [
    "600005",
    "Beban Bonus, Pesangon & Kompensasi",
    "EXPS",
    "6000"
  ],
  [
    "720001",
    "Beban Bunga Pinjaman",
    "OEXP",
    "7200"
  ],
  [
    "720007",
    "Beban Diluar Usaha Lainnya",
    "OEXP",
    "7200"
  ],
  [
    "600014",
    "Beban Ekspedisi, Pos & Materai",
    "EXPS",
    "6000"
  ],
  [
    "600004",
    "Beban Gaji, Upah & Honorer",
    "EXPS",
    "6000"
  ],
  [
    "600001",
    "Beban Iklan",
    "EXPS",
    "6000"
  ],
  [
    "600007",
    "Beban Katering & Makan Karyawan",
    "EXPS",
    "6000"
  ],
  [
    "600002",
    "Beban Komisi",
    "EXPS",
    "6000"
  ],
  [
    "600011",
    "Beban Listrik",
    "EXPS",
    "6000"
  ],
  [
    "600020",
    "Beban Operasional Lainnya",
    "EXPS",
    "6000"
  ],
  [
    "600012",
    "Beban PAM",
    "EXPS",
    "6000"
  ],
  [
    "600017",
    "Beban Pajak Penghasilan",
    "EXPS",
    "6000"
  ],
  [
    "600021",
    "Beban Penyusutan Gedung",
    "EXPS",
    "6000"
  ],
  [
    "600024",
    "Beban Penyusutan Inventaris Kantor",
    "EXPS",
    "6000"
  ],
  [
    "600022",
    "Beban Penyusutan Kendaraan",
    "EXPS",
    "6000"
  ],
  [
    "600023",
    "Beban Penyusutan Peralatan",
    "EXPS",
    "6000"
  ],
  [
    "600015",
    "Beban Perjalanan Dinas",
    "EXPS",
    "6000"
  ],
  [
    "600016",
    "Beban Perlengkapan Kantor",
    "EXPS",
    "6000"
  ],
  [
    "5101",
    "Beban Pokok Penjualan",
    "COGS",
    null
  ],
  [
    "600018",
    "Beban Retribusi & Sumbangan",
    "EXPS",
    "6000"
  ],
  [
    "600019",
    "Beban Sewa Gedung",
    "EXPS",
    "6000"
  ],
  [
    "600010",
    "Beban THR",
    "EXPS",
    "6000"
  ],
  [
    "600013",
    "Beban Telekomunikasi",
    "EXPS",
    "6000"
  ],
  [
    "600006",
    "Beban Transportasi Karyawan",
    "EXPS",
    "6000"
  ],
  [
    "600008",
    "Beban Tunjangan Kesehatan",
    "EXPS",
    "6000"
  ],
  [
    "1102",
    "Setara Kas",
    "BANK",
    null
  ],
  [
    "110201",
    "Deposito Bank",
    "BANK",
    "1102"
  ],
  [
    "4000",
    "Pendapatan Operasional",
    "REVE",
    null
  ],
  [
    "400004",
    "Diskon Penjualan",
    "REVE",
    "4000"
  ],
  [
    "4401",
    "Diskon Penjualan",
    "REVE",
    null
  ],
  [
    "440101",
    "Diskon Penjualan IDR",
    "REVE",
    "4401"
  ],
  [
    "3000",
    "Modal",
    "EQTY",
    null
  ],
  [
    "300001",
    "Equitas Saldo Awal",
    "EQTY",
    "3000"
  ],
  [
    "120002",
    "Gedung",
    "FASS",
    "1200"
  ],
  [
    "2201",
    "Hutang Jangka Panjang",
    "LTLY",
    null
  ],
  [
    "2102",
    "Kewajiban Jangka Pendek Lainnya",
    "OCLY",
    null
  ],
  [
    "210203",
    "Hutang Pembelian Belum Ditagih",
    "OCLY",
    "2102"
  ],
  [
    "120005",
    "Inventaris Kantor",
    "FASS",
    "1200"
  ],
  [
    "110101",
    "Kas Kecil",
    "BANK",
    "1101"
  ],
  [
    "120003",
    "Kendaraan",
    "FASS",
    "1200"
  ],
  [
    "300002",
    "Laba Ditahan",
    "EQTY",
    "3000"
  ],
  [
    "720005",
    "Laba/Rugi Belum Terealisasi",
    "OEXP",
    "7200"
  ],
  [
    "7202",
    "Laba/Rugi Belum Terealisasi",
    "OEXP",
    null
  ],
  [
    "720201",
    "Laba/Rugi Belum Terealisasi IDR",
    "OEXP",
    "7202"
  ],
  [
    "720006",
    "Laba/Rugi Disposisi Aset",
    "OEXP",
    "7200"
  ],
  [
    "7100",
    "Pendapatan Diluar Usaha",
    "OINC",
    null
  ],
  [
    "710004",
    "Laba/Rugi Revaluasi Aset",
    "OINC",
    "7100"
  ],
  [
    "720004",
    "Laba/Rugi Terealisasi",
    "OEXP",
    "7200"
  ],
  [
    "7201",
    "Laba/Rugi Terealisasi",
    "OEXP",
    null
  ],
  [
    "720101",
    "Laba/Rugi Terealisasi IDR",
    "OEXP",
    "7201"
  ],
  [
    "300003",
    "Modal Saham",
    "EQTY",
    "3000"
  ],
  [
    "210201",
    "PPN Keluaran",
    "OCLY",
    "2102"
  ],
  [
    "110504",
    "PPN Masukan",
    "OCAS",
    "1105"
  ],
  [
    "210202",
    "PPh 23 Pembelian",
    "OCLY",
    "2102"
  ],
  [
    "110505",
    "PPh 23 Penjualan",
    "OCAS",
    "1105"
  ],
  [
    "720003",
    "Pajak Jasa Giro",
    "OEXP",
    "7200"
  ],
  [
    "710002",
    "Pendapatan Bunga Deposito",
    "OINC",
    "7100"
  ],
  [
    "710005",
    "Pendapatan Diluar Usaha Lainnya",
    "OINC",
    "7100"
  ],
  [
    "400002",
    "Pendapatan Jasa",
    "REVE",
    "4000"
  ],
  [
    "710001",
    "Pendapatan Jasa Giro",
    "OINC",
    "7100"
  ],
  [
    "400001",
    "Penjualan",
    "REVE",
    "4000"
  ],
  [
    "710003",
    "Penjualan Persediaan / Perlengkapan",
    "OINC",
    "7100"
  ],
  [
    "120004",
    "Peralatan",
    "FASS",
    "1200"
  ],
  [
    "110501",
    "Perlengkapan Kantor",
    "OCAS",
    "1105"
  ],
  [
    "1104",
    "Persediaan",
    "INTR",
    null
  ],
  [
    "110401",
    "Persediaan",
    "INTR",
    "1104"
  ],
  [
    "110403",
    "Persediaan Dalam Proses",
    "INTR",
    "1104"
  ],
  [
    "110402",
    "Persediaan Terkirim",
    "INTR",
    "1104"
  ],
  [
    "1103",
    "Piutang Usaha",
    "AREC",
    null
  ],
  [
    "110301",
    "Piutang Usaha IDR",
    "AREC",
    "1103"
  ],
  [
    "400003",
    "Retur Penjualan",
    "REVE",
    "4000"
  ],
  [
    "110502",
    "Sewa Gedung Dibayar Dimuka",
    "OCAS",
    "1105"
  ],
  [
    "120001",
    "Tanah",
    "FASS",
    "1200"
  ],
  [
    "110302",
    "Uang Muka Pembelian IDR",
    "AREC",
    "1103"
  ],
  [
    "2101",
    "Utang Usaha",
    "APAY",
    null
  ],
  [
    "210102",
    "Uang Muka Penjualan IDR",
    "APAY",
    "2101"
  ],
  [
    "210101",
    "Utang Usaha IDR",
    "APAY",
    "2101"
  ],
  [
    "110404",
    "Barang Dalam Proses (WIP)",
    "OCAS",
    "1104"
  ],
  [
    "110506",
    "Piutang Karyawan",
    "OCAS",
    "1105"
  ],
  [
    "210204",
    "Hutang Gaji",
    "OCLY",
    "2102"
  ],
  [
    "510102",
    "Beban Material",
    "COGS",
    "5101"
  ],
  [
    "510103",
    "Penyesuaian Persediaan",
    "COGS",
    "5101"
  ],
  [
    "600025",
    "Diskon Pembelian",
    "EXPS",
    "6000"
  ],
  [
    "600026",
    "Retur Pembelian",
    "EXPS",
    "6000"
  ]
]

/** COA lama (30 akun) → kode baru. */
const OLD_TO_NEW = {
  "1000": "1101",
  "1100": "1103",
  "1150": "110506",
  "1200": "110401",
  "1300": "1200",
  "1400": "110504",
  "1500": "110404",
  "1600": "510103",
  "2000": "2101",
  "2100": "210201",
  "2200": "210201",
  "2300": "210204",
  "2400": "120006",
  "3000": "3000",
  "4000": "400001",
  "4100": "7100",
  "4200": "400003",
  "5000": "5101",
  "5100": "6000",
  "5110": "600020",
  "5200": "600004",
  "5300": "600021",
  "5400": "510102",
  "5500": "110101",
  "5600": "600020",
  "5700": "600025",
  "5800": "600014",
  "5810": "720002",
  "5900": "600026"
}

/** Field pemetaan di system_settings → kode akun standar. */
const SETTINGS_MAP = {
  "cashBankAccountId": "1101",
  "pettyCashAccountId": "110101",
  "defaultCashAccountId": "1101",
  "payrollBankAccountId": "110102",
  "salesReceivableAccountId": "1103",
  "employeeReceivableAccountId": "110506",
  "employeeLoanWriteOffExpenseAccountId": "720007",
  "inventoryAccountId": "110401",
  "purchaseInventoryAccountId": "210203",
  "inventoryAdjustmentAccountId": "510103",
  "stockAdjustmentAccountId": "510103",
  "wipAccountId": "110404",
  "materialExpenseAccountId": "510102",
  "materialIssueExpenseAccountId": "510102",
  "generalExpenseAccountId": "600020",
  "purchaseExpenseAccountId": "600020",
  "purchaseShippingAccountId": "600014",
  "purchaseAdminFeeAccountId": "720002",
  "purchaseDiscountAccountId": "600025",
  "purchaseReturnAccountId": "600026",
  "salariesPayableAccountId": "210204",
  "salaryExpenseAccountId": "600004",
  "salesAccountId": "400001",
  "salesRevenueAccountId": "400001",
  "salesReturnAccountId": "400003",
  "salesTaxAccountId": "210201",
  "purchaseTaxAccountId": "110504",
  "cogsAccountId": "5101",
  "accumulatedDepreciationAccountId": "12000601",
  "depreciationExpenseAccountId": "600021",
  "purchasePayableAccountId": "2101"
}

const ACCOURATE_TO_INTERNAL = {
  BANK: "ASSET", AREC: "ASSET", INTR: "ASSET", OCAS: "ASSET", FASS: "ASSET", DEPR: "ASSET",
  APAY: "LIABILITY", OCLY: "LIABILITY", LTLY: "LIABILITY", EQTY: "EQUITY",
  REVE: "REVENUE", OINC: "REVENUE", COGS: "EXPENSE", EXPS: "EXPENSE", OEXP: "EXPENSE",
}

const DATABASE_SOCKET_PATH = process.env.DATABASE_SOCKET_PATH
// S5443: tidak ada fallback socket /tmp yang dapat ditulis publik. Socket hanya
// dari DATABASE_SOCKET_PATH (env operator) atau dari query
// `socketPath`/`socket` di DATABASE_URL. Tanpa keduanya, DATABASE_URL wajib ada.
function poolConfig() {
  const fallback = DATABASE_SOCKET_PATH
    ? { socketPath: DATABASE_SOCKET_PATH, user: "root", password: "", database: "yara_erp", connectionLimit: 5 }
    : null
  const url = process.env.DATABASE_URL
  if (!url) {
    if (fallback) return fallback
    throw new Error("DATABASE_URL wajib diisi (atau set DATABASE_SOCKET_PATH ke socket MySQL lokal)")
  }
  try {
    const parsed = new URL(url)
    const socketPath = parsed.searchParams.get("socketPath") || parsed.searchParams.get("socket")
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "yara_erp"
    const user = decodeURIComponent(parsed.username || "root")
    const password = decodeURIComponent(parsed.password || "")
    if (socketPath) return { socketPath, user, password, database, connectionLimit: 5 }
    return { host: parsed.hostname || "127.0.0.1", port: parsed.port ? Number(parsed.port) : 3306, user, password, database, connectionLimit: 5 }
  } catch {
    if (fallback) return fallback
    throw new Error("DATABASE_URL wajib diisi (atau set DATABASE_SOCKET_PATH ke socket MySQL lokal)")
  }
}

/** Semua kolom di database yang mereferensikan accounts.id. */
async function accountReferences(conn) {
  const rows = await conn.query(
    `SELECT TABLE_NAME AS tabel, COLUMN_NAME AS kolom FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'accounts'`,
  )
  return rows.filter((row) => row.tabel !== "accounts")
}

async function main() {
  const conn = await mariadb.createConnection(poolConfig())
  const report = { renamed: [], merged: [], added: [], normalized: [], settings: [], skipped: [] }

  try {
    await conn.beginTransaction()

    let accounts = await conn.query("SELECT id, code, name, report_group FROM accounts")
    const byCode = new Map(accounts.map((a) => [a.code, a]))
    const refs = await accountReferences(conn)

    // Akun dianggap SUDAH baru bila punya report_group (kolom ini hanya diisi COA
    // standar). Tidak bisa memakai "kodenya ada di COA baru": kode lama dan baru
    // bisa bentrok arti — mis. 1200 = "Persediaan" (lama) vs "Aset Tetap" (baru),
    // 4000 = "Pendapatan Penjualan" (lama) vs "Pendapatan Operasional" (baru).
    const isMigrated = (row) => row.report_group != null

    // 1. Rename akun lama yang punya penerus 1:1 (id dipertahankan).
    for (const [oldCode, target] of Object.entries(OLD_TO_NEW)) {
      const oldRow = byCode.get(oldCode)
      if (!oldRow || isMigrated(oldRow)) continue
      const definition = ACCOUNTS.find(([code]) => code === target)
      if (!definition) continue
      const targetRow = byCode.get(target)
      if (targetRow && !isMigrated(targetRow)) {
        // Kode tujuan masih ditempati akun lama lain → gabungkan pada langkah 2.
        continue
      }
      if (targetRow && isMigrated(targetRow)) {
        // Sudah ada akun standar dengan kode itu → gabungkan pada langkah 2.
        continue
      }
      await conn.query("UPDATE accounts SET code = ?, name = ?, type = ?, report_group = ? WHERE id = ?", [
        target, definition[1], ACCOURATE_TO_INTERNAL[definition[2]], definition[2], oldRow.id,
      ])
      report.renamed.push(`${oldCode} → ${target} (${definition[1]})`)
      byCode.delete(oldCode)
      byCode.set(target, { ...oldRow, code: target, report_group: definition[2] })
    }

    // 2. Sisa akun lama (digabung atau dipindahkan kodenya) → pindahkan referensi lalu hapus.
    for (const [oldCode, target] of Object.entries(OLD_TO_NEW)) {
      const oldRow = byCode.get(oldCode)
      if (!oldRow || isMigrated(oldRow)) continue
      const targetRow = byCode.get(target)
      if (!targetRow) {
        report.skipped.push(`${oldCode} (tujuan ${target} belum ada)`)
        continue
      }
      if (targetRow.id !== oldRow.id) {
        for (const ref of refs) {
          await conn.query(
            `UPDATE \`${ref.tabel}\` SET \`${ref.kolom}\` = ? WHERE \`${ref.kolom}\` = ?`,
            [targetRow.id, oldRow.id],
          )
        }
        await conn.query("DELETE FROM accounts WHERE id = ?", [oldRow.id])
        report.merged.push(`${oldCode} → digabung ke ${targetRow.code} (${refs.length} kolom referensi)`)
        byCode.delete(oldCode)
      }
    }

    // 3. Tambahkan akun standar yang belum ada (induk lebih dulu).
    const missing = ACCOUNTS.filter(([code]) => !byCode.has(code))
    for (const [code, name, group, parent] of missing) {
      const parentRow = parent ? byCode.get(parent) : null
      const result = await conn.query(
        "INSERT INTO accounts (code, name, type, report_group, parent_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())",
        [code, name, ACCOURATE_TO_INTERNAL[group], group, parentRow ? parentRow.id : null],
      )
      byCode.set(code, { id: Number(result.insertId), code, report_group: group })
      report.added.push(code)
    }

    // 4a. Normalisasi: baris yang sudah memakai KODE standar tetapi belum
    // bertanda report_group (mis. dibuat manual) diselaraskan nama/tipe-nya —
    // id dipertahankan agar referensinya tidak putus.
    for (const [code, name, group] of ACCOUNTS) {
      const row = byCode.get(code)
      if (!row || isMigrated(row)) continue
      await conn.query("UPDATE accounts SET name = ?, type = ?, report_group = ? WHERE id = ?", [
        name, ACCOURATE_TO_INTERNAL[group], group, row.id,
      ])
      row.report_group = group
      report.normalized.push(`${code} (${name})`)
    }

    // 4b. Perbaiki parent_id untuk akun standar (termasuk yang baru ditambahkan).
    for (const [code, , , parent] of ACCOUNTS) {
      if (!parent) continue
      const child = byCode.get(code)
      const parentRow = byCode.get(parent)
      if (child && parentRow) {
        await conn.query("UPDATE accounts SET parent_id = ? WHERE id = ?", [parentRow.id, child.id])
      }
    }

    // 5. Arahkan ulang pemetaan akun di system_settings (kolom DB = snake_case).
    const toSnake = (value) => value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
    const settingsRows = await conn.query("SELECT id FROM system_settings ORDER BY id LIMIT 1")
    if (settingsRows.length) {
      const assignments = []
      const values = []
      for (const [field, code] of Object.entries(SETTINGS_MAP)) {
        const row = byCode.get(code)
        if (!row) continue
        assignments.push(`\`${toSnake(field)}\` = ?`)
        values.push(row.id)
      }
      values.push(settingsRows[0].id)
      await conn.query(`UPDATE system_settings SET ${assignments.join(", ")} WHERE id = ?`, values)
      report.settings.push(...Object.keys(SETTINGS_MAP))
    }

    if (DRY_RUN) {
      await conn.rollback()
    } else {
      await conn.commit()
    }

    const finalAccounts = await conn.query("SELECT COUNT(*) AS jumlah FROM accounts")
    console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}Migrasi COA selesai.`)
    console.log(`- di-rename  : ${report.renamed.length}`)
    report.renamed.forEach((line) => console.log(`    ${line}`))
    console.log(`- digabung   : ${report.merged.length}`)
    report.merged.forEach((line) => console.log(`    ${line}`))
    console.log(`- ditambah   : ${report.added.length}`)
    console.log(`- diselaraskan: ${report.normalized.length}`)
    console.log(`- pemetaan   : ${report.settings.length} field`)
    if (report.skipped.length) {
      console.log(`- DILEWATI   : ${report.skipped.join(", ")}`)
    }
    console.log(`- total akun : ${finalAccounts[0].jumlah}`)
  } catch (error) {
    await conn.rollback()
    console.error("Migrasi gagal, semua perubahan dibatalkan:", error.message)
    process.exitCode = 1
  } finally {
    await conn.end()
  }
}

main().catch((error) => {
  console.error("Migrasi gagal:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
