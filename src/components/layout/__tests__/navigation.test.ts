import { describe, it, expect } from "vitest"
import {
  navigation,
  flattenNavigation,
  canSeeNavItem,
  type NavItem,
} from "../navigation"

describe("navigation single source of truth", () => {
  it("grup Laporan ditandai sidebarLinkOnly dan anaknya tetap lengkap", () => {
    const group = navigation.find((item) => item.href === "/laporan")

    // Sidebar menautkan ke katalog saja: 47 laporan sebagai submenu menenggelamkan
    // menu modul lain dan tidak bisa dicari.
    expect(group?.sidebarLinkOnly).toBe(true)

    // Tapi `children` TIDAK boleh ikut dihapus: label, ikon, izin, deskripsi
    // katalog, breadcrumb, dan command palette semuanya membaca dari sini.
    expect(group?.children?.length ?? 0).toBeGreaterThan(30)
    expect(
      (group?.children ?? []).every((child) => {
        if (["/laporan/gaji-karyawan", "/laporan/pph-21", "/laporan/porsi-gaji"].includes(child.href)) {
          // Fail-closed: view_reports generik TIDAK boleh membuka laporan gaji.
          return child.permission === "view_payroll_reports" && !(child.permissions ?? []).includes("view_reports")
        }
        // bukti-potong-pph = laporan pajak pemasok (VendorBill), bukan
        // payroll — wajib jatuh ke cabang view_reports umum di bawah
        // (vonis BOT 4 F-2026-10-21-034).
        return child.permission === "view_reports"
      }),
    ).toBe(true)
  })

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
      "Pindai Barang",
      "Baris Rak",
      "Revisi BOM",
      "Pengendalian Mutu",
      "Saldo Cuti",
      "Apresiasi",
      "Kompatibilitas",
      "Tugas",
      "Laba Rugi per Pusat Biaya",
      "Harga Beli Multi-Sumber",
      "Serapan Overhead",
    ]) {
      expect(labels, `menu "${label}" harus ada`).toContain(label)
    }
  })

  it("links every report page on disk (no orphan /laporan/* page)", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const dir = path.resolve(__dirname, "../../../app/(dashboard)/laporan")
    const routes: string[] = []
    const walk = (current: string, rel = "") => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith("_")) continue
          // Dynamic segments cannot be linked statically. An OPTIONAL catch-all
          // ([[...x]]) also serves its own parent path — that is the URL the
          // navigation must expose (e.g. /laporan/laba-rugi, /laporan/neraca).
          if (entry.name.startsWith("[[")) {
            const parent = `/laporan/${rel}`.replace(/\/$/, "")
            if (!routes.includes(parent)) routes.push(parent)
            continue
          }
          if (entry.name.startsWith("[")) continue
          walk(path.join(current, entry.name), rel ? `${rel}/${entry.name}` : entry.name)
        } else if (entry.name === "page.tsx" && rel) {
          // Halaman alias lama hanya mengalihkan ke laporan kanoniknya (mis.
          // /laporan/keuangan → /laporan/neraca-saldo) — bukan laporan, jadi tidak
          // perlu muncul di menu; yang wajib ada di menu adalah laporan tujuan.
          const source = fs.readFileSync(path.join(current, entry.name), "utf8")
          if (/\bredirect\(/.test(source)) continue
          routes.push(`/laporan/${rel}`)
        }
      }
    }
    walk(dir)

    const navHrefs = flattenNavigation().map((e) => e.href)
    for (const route of routes) {
      expect(navHrefs, `laporan "${route}" harus ada di navigasi (sidebar/cmdK)`).toContain(route)
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
      // Pengecualian sempit PUTUSAN Lead Q-PS-1 (2026-10-25): hanya
      // /sdm/slip-gaji-saya boleh tanpa permission — gerbangnya requireAuth()
      // saja dan loader fail-closed sendiri; view_payroll akan menyembunyikan
      // fitur dari karyawan sasaran (BR-PS-09), key baru ditolak tahap 1.
      // Entri lain tanpa permission tetap harus MERAH.
      if (entry.href === "/sdm/slip-gaji-saya") continue
      // `permission` (tunggal) atau `permissions` (any-of, mis. Perintah Pembayaran
      // yang isinya turunan dari tagihan/pembayaran vendor).
      const hasPermission = entry.permission || (entry.permissions?.length ?? 0) > 0
      expect(hasPermission, `${entry.href} tanpa permission`).toBeTruthy()
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
