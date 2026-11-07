import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { ROUTE_PERMS } from "@/lib/auth/action-perms"

/**
 * Penjaga: entri `ROUTE_PERMS` harus sama dengan izin yang benar-benar
 * dituntut server action-nya.
 *
 * `ActionDropdown` menyembunyikan/menampilkan Ubah & Hapus dari registry ini
 * (bukan dari izin action). Jadi bila registry menyebut izin yang BERBEDA dari
 * `requirePermission` di action-nya, salah satu dari dua hal terjadi:
 *
 *   - registry lebih longgar → tombol tampil bagi peran yang action-nya pasti
 *     menolak (persis kelas yang dikejar putaran 220–228, tapi kali ini
 *     lewat registry, bukan lewat halaman);
 *   - registry lebih ketat → tombol hilang bagi peran yang sebenarnya berhak,
 *     dan fiturnya mati senyap untuk mereka.
 *
 * `permission-seed-parity` hanya memastikan izin di registry ADA di katalog;
 * ia tidak membandingkannya dengan action. Tes ini menutup sisi itu.
 */

const ACTIONS = join(process.cwd(), "src/actions")

/** Peta nama action → izin yang dituntutnya (ambil `requirePermission` pertama). */
function actionPermissions(): Map<string, string> {
  const map = new Map<string, string>()
  for (const file of readdirSync(ACTIONS)) {
    if (!file.endsWith(".ts")) continue
    const src = readFileSync(join(ACTIONS, file), "utf8")
    for (const m of src.matchAll(/export async function (\w+)\(/g)) {
      const start = m.index ?? 0
      const next = src.indexOf("\nexport ", start)
      const body = src.slice(start, next === -1 ? src.length : next)
      const perm = body.match(/requirePermission\(\s*"([^"]+)"/)
      if (perm) map.set(m[1], perm[1])
    }
  }
  return map
}

/**
 * Action hapus/ubah yang dipakai baris tabel per modul. Dipetakan eksplisit
 * karena nama action tidak mengikuti pola yang bisa diturunkan dari prefix
 * route (mis. `/inventaris/rak` → `deleteRack`, `/proyek/tugas` → `deleteTask`).
 */
const ROW_ACTION_CASES: Array<{ prefix: string; action: string; kind: "delete" | "edit" }> = [
  { prefix: "/master/barang", action: "deleteItem", kind: "delete" },
  { prefix: "/master/pelanggan", action: "deleteCustomer", kind: "delete" },
  { prefix: "/master/vendor", action: "deleteVendor", kind: "delete" },
  { prefix: "/master/karyawan", action: "deleteEmployee", kind: "delete" },
  { prefix: "/penjualan/penawaran", action: "deleteQuotation", kind: "delete" },
  { prefix: "/penjualan/pesanan", action: "deleteSalesOrder", kind: "delete" },
  { prefix: "/pembelian/pesanan", action: "deletePurchaseOrder", kind: "delete" },
  { prefix: "/pembelian/tagihan", action: "deleteVendorBill", kind: "delete" },
  { prefix: "/pembelian/penerimaan", action: "deleteGoodsReceipt", kind: "delete" },
  { prefix: "/inventaris/penyesuaian", action: "deleteStockAdjustment", kind: "delete" },
  { prefix: "/inventaris/transfer", action: "deleteInventoryTransfer", kind: "delete" },
  { prefix: "/inventaris/rak", action: "deleteRack", kind: "delete" },
  { prefix: "/inventaris/baris-rak", action: "deleteRackRow", kind: "delete" },
  { prefix: "/produksi/products", action: "deleteProduct", kind: "delete" },
  { prefix: "/produksi/perintah-kerja", action: "deleteWorkOrder", kind: "delete" },
  { prefix: "/produksi/production-orders", action: "deleteProductionOrder", kind: "delete" },
  { prefix: "/aset/kategori", action: "deleteAssetCategory", kind: "delete" },
  { prefix: "/aset/merek", action: "deleteAssetBrand", kind: "delete" },
  { prefix: "/aset/grup", action: "deleteAssetGroup", kind: "delete" },
  { prefix: "/aset/transfer", action: "deleteAssetTransfer", kind: "delete" },
  { prefix: "/sdm/cuti", action: "deleteLeaveRequest", kind: "delete" },
  { prefix: "/sdm/lembur", action: "deleteOvertimeRequest", kind: "delete" },
  { prefix: "/sdm/pinjaman", action: "deleteEmployeeLoan", kind: "delete" },
  { prefix: "/sdm/apresiasi", action: "deleteAppreciation", kind: "delete" },
  { prefix: "/sdm/lembar-waktu", action: "deleteTimesheet", kind: "delete" },
  { prefix: "/proyek/tugas", action: "deleteTask", kind: "delete" },
  { prefix: "/proyek", action: "deleteProject", kind: "delete" },
  { prefix: "/keuangan/pusat-biaya", action: "deleteCostCenter", kind: "delete" },
  { prefix: "/pengaturan/workflow", action: "deleteApprovalWorkflow", kind: "delete" },
]

describe("ROUTE_PERMS mencerminkan izin yang dituntut action-nya", () => {
  const perms = actionPermissions()

  it("pemindaian action tidak vakum", () => {
    expect(perms.size).toBeGreaterThan(100)
  })

  it("setiap entri registry cocok dengan requirePermission action barisnya", () => {
    const offenders: string[] = []
    for (const c of ROW_ACTION_CASES) {
      const entry = ROUTE_PERMS.find((e) => e.prefix === c.prefix)
      if (!entry) {
        offenders.push(`${c.prefix}: tidak ada entri ROUTE_PERMS`)
        continue
      }
      const expected = c.kind === "delete" ? entry.delete : entry.edit
      const actual = perms.get(c.action)
      if (!actual) {
        offenders.push(`${c.prefix}: action ${c.action} tidak ditemukan`)
        continue
      }
      if (expected !== actual) {
        offenders.push(
          `${c.prefix}: registry=${expected ?? "(tidak ada)"} action=${c.action} menuntut ${actual}`,
        )
      }
    }
    expect(
      offenders,
      `Registry ROUTE_PERMS menyimpang dari izin action (tombol tampil/hilang salah):\n${offenders.join("\n")}`,
    ).toEqual([])
  })

  it("entri registry yang hanya punya edit memang tidak punya aksi hapus", () => {
    // Tiga entri separuh sengaja: katalog tidak punya izin hapus untuk
    // payroll/aturan statutori/rekonsiliasi bank, dan memang tidak ada aksi
    // delete-nya (komentarnya ada di action-perms.ts). Daftar ini dikunci dua
    // arah: entri baru tanpa delete akan memerah, dan bila salah satu dari
    // ketiganya kelak diberi izin hapus, entri ini harus dipangkas.
    const editOnly = ROUTE_PERMS.filter((e) => e.edit && !e.delete).map((e) => e.prefix)
    expect(editOnly.sort()).toEqual([
      "/keuangan/rekonsiliasi-bank",
      "/sdm/aturan-statutori",
      "/sdm/penggajian",
    ])
  })
})
