import { describe, it, expect } from "vitest"
import {
  navigation,
  flattenNavigation,
  canSeeNavItem,
  type NavItem,
} from "../navigation"

describe("navigation single source of truth", () => {
  it("includes every menu the sidebar used to hardcode (no drift)", () => {
    const labels = flattenNavigation().map((e) => e.label)
    // A representative sample of menus that the old hardcoded command palette
    // was missing — they must all be present now.
    for (const label of [
      "Kategori Pelanggan",
      "Merek",
      "Kategori Pengeluaran",
      "Termin Pembayaran",
      "Metode Pembayaran",
      "Metode Pengiriman",
      "Scan Barang",
      "Baris Rak",
      "Revisi BOM",
      "Quality Control",
      "Saldo Cuti",
      "Apresiasi",
      "Key Figure Statistik",
      "Fitment",
      "Tugas",
      "Laba Rugi per CC",
      "Anggaran vs Realisasi",
      "Harga Beli Multi-Sumber",
      "Serapan Overhead",
    ]) {
      expect(labels, `menu "${label}" harus ada`).toContain(label)
    }
  })

  it("flattens only leaf pages (no parent group duplicated as a page)", () => {
    const flat = flattenNavigation()
    const hrefs = flat.map((e) => e.href)
    // Parent section hrefs should not appear as their own palette entry.
    expect(hrefs).not.toContain("/master")
    expect(hrefs).not.toContain("/penjualan")
    // But leaf pages should.
    expect(hrefs).toContain("/master/pelanggan")
    expect(hrefs).toContain("/penjualan/faktur")
  })

  it("labels each leaf with its parent group", () => {
    const flat = flattenNavigation()
    const faktur = flat.find((e) => e.href === "/penjualan/faktur")
    expect(faktur?.group).toBe("Penjualan")
    const jurnal = flat.find((e) => e.href === "/keuangan/jurnal")
    expect(jurnal?.group).toBe("Keuangan")
  })

  it("assigns every entry a permission (so the palette can filter)", () => {
    for (const entry of flattenNavigation()) {
      expect(entry.permission, `${entry.href} tanpa permission`).toBeTruthy()
    }
  })

  it("has no duplicate hrefs", () => {
    const hrefs = flattenNavigation().map((e) => e.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})

describe("canSeeNavItem", () => {
  const item: NavItem = {
    label: "Faktur",
    href: "/penjualan/faktur",
    icon: navigation[1].icon,
    permission: "view_sales_invoices",
  }

  it("super admin sees everything", () => {
    expect(canSeeNavItem(item, [], true)).toBe(true)
  })

  it("hides an item when the permission is missing", () => {
    expect(canSeeNavItem(item, ["view_sales_orders"], false)).toBe(false)
  })

  it("shows an item when the permission is present", () => {
    expect(canSeeNavItem(item, ["view_sales_invoices"], false)).toBe(true)
  })

  it("always shows items without a permission requirement", () => {
    const openItem: NavItem = { label: "X", href: "/x", icon: navigation[0].icon }
    expect(canSeeNavItem(openItem, [], false)).toBe(true)
  })
})
