import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

/**
 * RBAC per role di browser: pengguna demo hasil seed (satu per role,
 * kata sandi bersama dari SEED_ADMIN_PASSWORD) hanya boleh membuka
 * halaman sesuai izin role-nya. Halaman terlarang memantulkan ke
 * dasbor (perilaku `requirePermission`), halaman yang diizinkan tetap
 * di URL-nya. Spec ini hanya membaca — tidak membuat/mengubah data.
 *
 * Butuh DB yang sudah di-seed dengan ALLOW_DEMO_SEED=true; kata sandi
 * demo mengikuti E2E_PASSWORD (default "Yara1234", sama seperti
 * auth.setup.ts).
 */
const PASSWORD = process.env.E2E_PASSWORD || "Yara1234"

interface RoleCase {
  role: string
  email: string
  allowed: string[]
  forbidden: string[]
}

const CASES: RoleCase[] = [
  {
    role: "super_admin",
    email: "admin@erp.yarasoft.net",
    allowed: ["/pengaturan/pengguna", "/pengaturan/peran"],
    forbidden: [],
  },
  {
    // admin TIDAK lagi memegang administrasi sistem (manage_users,
    // manage_roles, manage_settings) — hanya super_admin.
    role: "admin",
    email: "admin.dewi@isf.co.id",
    allowed: ["/master/barang"],
    forbidden: ["/pengaturan/pengguna", "/pengaturan/peran", "/pengaturan/database"],
  },
  {
    role: "warehouse",
    email: "gudang@isf.co.id",
    allowed: ["/master/barang"],
    forbidden: ["/sdm/penggajian", "/pengaturan/pengguna"],
  },
  {
    role: "finance",
    email: "keuangan@isf.co.id",
    allowed: ["/sdm/penggajian"],
    forbidden: ["/pengaturan/database", "/pengaturan/pengguna"],
  },
  {
    role: "karyawan",
    email: "karyawan@isf.co.id",
    allowed: ["/sdm/penggajian"],
    forbidden: ["/penjualan/faktur", "/pengaturan/pengguna"],
  },
  {
    role: "purchasing",
    email: "pembelian@isf.co.id",
    allowed: ["/pembelian/pesanan"],
    forbidden: ["/sdm/penggajian"],
  },
]

async function loginAs(page: Page, email: string) {
  await page.goto("/login")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(PASSWORD)
  await page.locator("#login-submit").click()
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 })
}

interface MenuCase {
  role: string
  email: string
  /** Grup sidebar yang harus tampil (punya ≥1 anak yang diizinkan). */
  visibleGroups: string[]
  /** Grup sidebar yang tidak boleh tampil sama sekali. */
  hiddenGroups: string[]
  /** Tautan yang tidak boleh dirender di sidebar (tersaring izin). */
  hiddenLinks: string[]
  /** Pasangan halaman → tautan yang harus terlihat sesudah grupnya aktif. */
  visibleLinkAfterGoto?: { goto: string; href: string }
  /** Kartu hub Pengaturan yang harus tampil / tidak boleh tampil. */
  hubCards?: { visible: string[]; hidden: string[] }
}

/**
 * UX per role: bukan cuma URL yang ditolak — menu yang tidak diizinkan
 * tidak boleh DITAWARKAN. Anak yang tersaring tidak dirender sama sekali
 * (count 0), dan grup tanpa satu pun anak yang diizinkan hilang utuh.
 */
const MENU_CASES: MenuCase[] = [
  {
    role: "super_admin",
    email: "admin@erp.yarasoft.net",
    visibleGroups: ["Data Master", "Penjualan", "Keuangan", "Pengaturan"],
    hiddenGroups: [],
    hiddenLinks: [],
    hubCards: {
      visible: ["/pengaturan/pengguna", "/pengaturan/peran", "/pengaturan/database"],
      hidden: [],
    },
  },
  {
    // Hasil pemangkasan matriks: grup Pengaturan tetap ada (masih banyak
    // seksi lain), tetapi tiga tautan administrasi sistem hilang dari menu.
    role: "admin",
    email: "admin.dewi@isf.co.id",
    visibleGroups: ["Pengaturan"],
    hiddenGroups: [],
    hiddenLinks: [],
    // Di hub, kartu administrasi sistem juga tidak ditawarkan ke admin;
    // kartu Persetujuan (approve_workflows) tetap tampil.
    hubCards: {
      visible: ["/pengaturan/persetujuan"],
      hidden: ["/pengaturan/pengguna", "/pengaturan/peran", "/pengaturan/database", "/pengaturan/perusahaan"],
    },
  },
  {
    role: "warehouse",
    email: "gudang@isf.co.id",
    visibleGroups: ["Inventaris", "Data Master"],
    hiddenGroups: ["Keuangan", "SDM", "Pengaturan"],
    hiddenLinks: ["/sdm/penggajian", "/pengaturan"],
    visibleLinkAfterGoto: { goto: "/master/barang", href: "/master/barang" },
  },
  {
    role: "finance",
    email: "keuangan@isf.co.id",
    visibleGroups: ["Keuangan", "SDM"],
    hiddenGroups: [],
    hiddenLinks: ["/pengaturan/pengguna", "/pengaturan/database"],
    visibleLinkAfterGoto: { goto: "/sdm/penggajian", href: "/sdm/penggajian" },
  },
  {
    role: "karyawan",
    email: "karyawan@isf.co.id",
    visibleGroups: ["SDM"],
    hiddenGroups: ["Keuangan", "Penjualan", "Pembelian", "Pengaturan"],
    hiddenLinks: ["/penjualan/faktur", "/pengaturan"],
    visibleLinkAfterGoto: { goto: "/sdm/penggajian", href: "/sdm/penggajian" },
  },
  {
    role: "purchasing",
    email: "pembelian@isf.co.id",
    visibleGroups: ["Pembelian"],
    hiddenGroups: ["SDM", "Keuangan"],
    hiddenLinks: ["/sdm/penggajian", "/pengaturan"],
    visibleLinkAfterGoto: { goto: "/pembelian/pesanan", href: "/pembelian/pesanan" },
  },
]

test.describe("RBAC: akses halaman per role", () => {
  // Jangan warisi sesi admin dari setup — setiap role login sendiri.
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const { role, email, allowed, forbidden } of CASES) {
    test(`role ${role} hanya membuka halaman sesuai izinnya`, async ({ page }) => {
      await loginAs(page, email)

      for (const path of allowed) {
        await page.goto(path)
        await expect(page, `${role} seharusnya boleh membuka ${path}`).toHaveURL(
          new RegExp(`${path.replaceAll("/", "\\/")}$`),
        )
      }

      for (const path of forbidden) {
        await page.goto(path)
        // requirePermission memantulkan ke dasbor bila izin tidak ada.
        await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 })
        await expect(page, `${role} seharusnya ditolak dari ${path}`).toHaveURL(/\/$/)
      }
    })
  }
})

test.describe("RBAC: menu sidebar per role", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const { role, email, visibleGroups, hiddenGroups, hiddenLinks, visibleLinkAfterGoto, hubCards } of MENU_CASES) {
    test(`menu role ${role} hanya menawarkan modul sesuai izinnya`, async ({ page }, testInfo) => {
      skipOnMobile(testInfo.project.name, "Sidebar desktop; proyek mobile memakai navigasi lain")
      await loginAs(page, email)
      const sidebar = page.locator('[data-sidebar="sidebar"]')

      // Grup kolaps dirender sebagai tombol; entri daun (mis. Pengaturan)
      // sebagai tautan. Keduanya dicari dari labelnya agar asersi tidak
      // lolos kosong hanya karena bentuk elemennya berbeda.
      for (const group of visibleGroups) {
        await expect(
          sidebar.locator(`a, button`).filter({ hasText: group }).first(),
          `${role} seharusnya melihat grup ${group}`,
        ).toBeVisible({ timeout: 15_000 })
      }
      for (const group of hiddenGroups) {
        await expect(
          sidebar.locator(`a, button`).filter({ hasText: group }),
          `${role} seharusnya TIDAK melihat grup ${group}`,
        ).toHaveCount(0)
      }
      for (const href of hiddenLinks) {
        await expect(
          sidebar.locator(`a[href="${href}"]`),
          `${role} seharusnya TIDAK ditawari ${href}`,
        ).toHaveCount(0)
      }

      if (visibleLinkAfterGoto) {
        await page.goto(visibleLinkAfterGoto.goto)
        await expect(
          sidebar.locator(`a[href="${visibleLinkAfterGoto.href}"]`),
          `${role} seharusnya melihat tautan ${visibleLinkAfterGoto.href} di sidebar`,
        ).toBeVisible({ timeout: 15_000 })
      }

      if (hubCards) {
        await page.goto("/pengaturan")
        for (const href of hubCards.visible) {
          await expect(
            page.locator(`main a[href="${href}"]`),
            `${role} seharusnya melihat kartu ${href} di hub Pengaturan`,
          ).toBeVisible({ timeout: 15_000 })
        }
        for (const href of hubCards.hidden) {
          await expect(
            page.locator(`main a[href="${href}"]`),
            `${role} seharusnya TIDAK ditawari kartu ${href} di hub Pengaturan`,
          ).toHaveCount(0)
        }
      }
    })
  }
})

test.describe("RBAC: tombol aksi per role", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("karyawan yang hanya boleh melihat penggajian tidak ditawari tombol buat", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Tombol header halaman daftar")
    await loginAs(page, "karyawan@isf.co.id")
    await page.goto("/sdm/penggajian")
    await expect(page.locator("#create-payroll-btn")).toHaveCount(0)
  })

  test("finance melihat tombol buat penggajian", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Tombol header halaman daftar")
    await loginAs(page, "keuangan@isf.co.id")
    await page.goto("/sdm/penggajian")
    // Tunggu streaming RSC selesai: selama muatan `<div id="S:*">` belum
    // ditukar, salinan tombol masih ada di DOM tersembunyi dan locator id
    // terkena strict-mode violation palsu.
    await page.waitForLoadState("networkidle")
    await expect(page.locator("#create-payroll-btn")).toBeVisible({ timeout: 15_000 })
  })
})
