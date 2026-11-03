import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Pararelisasi loader halaman jurnal: ketiga master independen wajib
 * dimuat satu Promise.all (bukan serial), urutan hasil tidak berubah.
 * Pola source-assertion sama seperti leave-detail-permissions.test.ts.
 */
function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("halaman jurnal memuat master paralel", () => {
  it("tambah: account aktif + costCenter + profitCenter satu Promise.all", () => {
    const page = read(
      "src/app/(dashboard)/keuangan/jurnal/tambah/page.tsx",
    )
    expect(page).toContain(
      "const [accounts, costCenters, profitCenters] = await Promise.all([",
    )
    // Putaran 104: picker akun memakai loadPostableAccounts (hanya akun daun
    // yang bisa diposting), bukan prisma.account.findMany mentah.
    expect(page).toContain("loadPostableAccounts()")
    expect(page).toContain("prisma.costCenter.findMany({")
    expect(page).toContain("prisma.profitCenter.findMany({")
    expect(page).not.toContain("const accounts = await prisma.account.findMany")
  })

  it("ubah: ketiga master satu Promise.all sesudah resolveEntity", () => {
    const page = read(
      "src/app/(dashboard)/keuangan/jurnal/[slug]/ubah/page.tsx",
    )
    expect(page).toContain(
      "const [accounts, costCenters, profitCenters] = await Promise.all([",
    )
    expect(page.indexOf("await Promise.all([")).toBeGreaterThan(
      page.indexOf("await resolveEntity("),
    )
    expect(page).not.toContain("const accounts = await prisma.account.findMany")
  })

  it("detail uang muka: 5 muatan sesudah dp satu Promise.all", () => {
    const page = read(
      "src/app/(dashboard)/penjualan/uang-muka/[slug]/page.tsx",
    )
    expect(page).toContain(
      "const [[vatRow], canConfirm, pmMap, dpCredits, openInvoices] =",
    )
    expect(page).toContain("loadDownPaymentTaxStatusRows({ downPaymentId: dp.id })")
    expect(page).toContain('hasPermission("confirm_down_payments")')
    expect(page).toContain("getPaymentMethodMap()")
    expect(page).toContain("prisma.customerCredit.findMany({")
    expect(page).toContain("prisma.salesInvoice.findMany({")
    expect(page.indexOf("await Promise.all([")).toBeGreaterThan(
      page.indexOf("if (!dp) notFound()"),
    )
    expect(page).not.toContain("const canConfirm = await hasPermission")
    expect(page).not.toContain("const pmMap = await getPaymentMethodMap()")
  })
})
