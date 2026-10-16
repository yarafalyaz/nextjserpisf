import { describe, it, expect } from "vitest"
import { activityEntityHref, applyReferenceLabel, isTrackedActivityReference } from "../activity-href"

describe("activityEntityHref", () => {
  // Dokumen transaksi ditangani `referenceHref`, jadi tidak perlu dipetakan ulang.
  it("memakai rute dokumen yang sudah ada", () => {
    expect(activityEntityHref("SalesInvoice", 16)).toBe("/penjualan/faktur/16")
    expect(activityEntityHref("PurchaseOrder", 3)).toBe("/pembelian/pesanan/3")
    expect(activityEntityHref("GoodsReceipt", 7)).toBe("/pembelian/penerimaan/7")
  })

  it("memetakan data master ke halaman detailnya", () => {
    expect(activityEntityHref("Item", 5)).toBe("/master/barang/5")
    expect(activityEntityHref("Customer", 1)).toBe("/master/pelanggan/1")
    expect(activityEntityHref("Rack", 9)).toBe("/inventaris/rak/9")
    expect(activityEntityHref("Role", 2)).toBe("/pengaturan/peran/2")
    expect(activityEntityHref("User", 4)).toBe("/pengaturan/pengguna/4")
  })

  it("mengembalikan null bila tidak ada rute atau id", () => {
    expect(activityEntityHref("ModelYangTidakAda", 1)).toBeNull()
    expect(activityEntityHref("Item", null)).toBeNull()
    expect(activityEntityHref(null, 1)).toBeNull()
    expect(activityEntityHref("Item", Number.NaN)).toBeNull()
  })
})

describe("applyReferenceLabel", () => {
  it("mengganti token #id dengan label entitasnya", () => {
    expect(applyReferenceLabel("Membuat faktur penjualan #16", 16, "007/INV/IRO/10/2026")).toBe(
      "Membuat faktur penjualan 007/INV/IRO/10/2026",
    )
  })

  it("membiarkan deskripsi apa adanya bila label tidak ada", () => {
    expect(applyReferenceLabel("Membuat faktur penjualan #16", 16, null)).toBe(
      "Membuat faktur penjualan #16",
    )
    expect(applyReferenceLabel("Menghapus rak #9", null, "R01")).toBe("Menghapus rak #9")
  })

  // Penting: penggantian harus terikat pada id baris itu, bukan id lain yang
  // kebetulan muncul di teks.
  it("tidak menyentuh id yang berbeda", () => {
    expect(applyReferenceLabel("Menghapus rak #9", 16, "007/INV/IRO/10/2026")).toBe("Menghapus rak #9")
  })
})

describe("isTrackedActivityReference", () => {
  it("true untuk entitas yang labelnya bisa diresolusi", () => {
    expect(isTrackedActivityReference("SalesInvoice")).toBe(true)
    expect(isTrackedActivityReference("Warehouse")).toBe(true)
    expect(isTrackedActivityReference("VehicleBrand")).toBe(true)
  })

  // Model tak dilacak vs record terhapus adalah dua sebab berbeda; UI memakai
  // pembeda ini untuk menandai "dihapus" hanya pada kasus yang kedua.
  it("false untuk model yang tidak dilacak atau kosong", () => {
    expect(isTrackedActivityReference("EntitasTakDikenal")).toBe(false)
    expect(isTrackedActivityReference(null)).toBe(false)
    expect(isTrackedActivityReference(undefined)).toBe(false)
  })
})
