import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { navigation } from "@/components/layout/navigation"
import { NAV_CARD_DESCRIPTIONS } from "@/components/layout/nav-descriptions"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"

/**
 * Kartu di halaman ringkasan modul (hub) diturunkan dari `navigation.ts`.
 *
 * Sebelumnya setiap hub menyimpan array sendiri (label + ikon + izin + deskripsi), dan
 * saat audit ditemukan 19 penyimpangan: hub Pembelian masih "Pesanan" padahal menu
 * "Pesanan Pembelian", hub Laporan memakai 4 nama lama, dan tiga halaman (Scan Barang,
 * Baris Rak, Saldo Cuti) tidak muncul sama sekali di hub-nya.
 *
 * Tes ini menjaga dua hal: semua kartu benar-benar turunan navigasi, dan setiap kartu
 * punya deskripsi (tanpa href yatim di peta deskripsi).
 */
const HUB_GROUPS = [
  "/master",
  "/penjualan",
  "/pembelian",
  "/inventaris",
  "/produksi",
  "/sdm",
  "/keuangan",
  "/crm",
  "/laporan",
]

const ROOT = process.cwd()

describe("kartu hub ↔ navigasi", () => {
  it("menghasilkan kartu persis sama dengan anak grup di navigasi", () => {
    for (const hub of HUB_GROUPS) {
      const group = navigation.find((item) => item.href === hub)
      const items = moduleItemsForGroup(hub)
      expect(items.map((i) => i.href), hub).toEqual((group?.children ?? []).map((c) => c.href))
      expect(items.map((i) => i.label), hub).toEqual((group?.children ?? []).map((c) => c.label))
      expect(items.map((i) => i.icon), hub).toEqual((group?.children ?? []).map((c) => c.icon))
    }
  })

  it("setiap kartu hub punya deskripsi", () => {
    const tanpaDeskripsi: string[] = []
    for (const hub of HUB_GROUPS) {
      for (const item of moduleItemsForGroup(hub)) {
        if (!item.desc) tanpaDeskripsi.push(`${hub} → ${item.href}`)
      }
    }
    expect(tanpaDeskripsi).toEqual([])
  })

  it("tidak ada deskripsi untuk href yang tidak ada di navigasi", () => {
    const navHrefs = new Set<string>()
    const collect = (items: typeof navigation) => {
      for (const item of items) {
        navHrefs.add(item.href)
        if (item.children) collect(item.children)
      }
    }
    collect(navigation)
    const yatim = Object.keys(NAV_CARD_DESCRIPTIONS).filter((href) => !navHrefs.has(href))
    expect(yatim).toEqual([])
  })

  it("izin grup = gabungan izin anaknya (dipakai requireAnyPermission halaman hub)", () => {
    for (const hub of HUB_GROUPS) {
      const items = moduleItemsForGroup(hub)
      const expected = items.flatMap((i) => [
        ...(i.permission ? [i.permission] : []),
        ...(i.permissions ?? []),
      ])
      expect(groupPermissions(hub), hub).toEqual(expected)
      expect(groupPermissions(hub).length, hub).toBeGreaterThan(0)
    }
  })

  it("halaman hub tidak lagi menulis daftar kartunya sendiri", () => {
    // Penjaga anti-regresi: kalau seseorang menyalin array kartu kembali ke halaman hub,
    // labelnya bisa menyimpang lagi dari menu.
    const offenders: string[] = []
    for (const file of [
      ...HUB_GROUPS.map((hub) => `src/app/(dashboard)${hub}/page.tsx`),
    ]) {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8")
      if (!source.includes("moduleItemsForGroup(")) offenders.push(`${file} (tidak memakai helper)`)
      if (/const\s+\w+\s*:\s*ModuleItem\[\]/.test(source)) offenders.push(`${file} (mendefinisikan array kartu sendiri)`)
    }
    expect(offenders).toEqual([])
  })
})
