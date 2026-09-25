import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * The create-form pages are client components, so their permission check lives in
 * a parent layout (a server component). Without it a user lacking the permission
 * still saw the whole form and only got an opaque error on submit - see the audit
 * finding for the 8 create ("tambah") pages.
 *
 * This table pins each layout to the permission enforced by the server action the
 * page submits to; removing or changing a guard fails here.
 */

const requirePermissionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 1 }))

vi.mock("@/lib/auth/permissions", () => ({ requirePermission: requirePermissionMock }))

import BankLayout from "../app/(dashboard)/master/bank/tambah/layout"
import BarcodeLayout from "../app/(dashboard)/master/barcode/tambah/layout"
import ItemCategoryLayout from "../app/(dashboard)/master/kategori-barang/tambah/layout"
import ExpenseCategoryLayout from "../app/(dashboard)/master/kategori-pengeluaran/tambah/layout"
import TaxLayout from "../app/(dashboard)/master/pajak/tambah/layout"
import UomLayout from "../app/(dashboard)/master/satuan/tambah/layout"
import PaymentTermLayout from "../app/(dashboard)/master/syarat-pembayaran/tambah/layout"
import SkfLayout from "../app/(dashboard)/keuangan/angka-kunci-statistik/tambah/layout"

type Layout = (props: { children: React.ReactNode }) => Promise<unknown>

const CASES: Array<[string, string, Layout]> = [
  ["master/bank/tambah", "create_banks", BankLayout as unknown as Layout],
  ["master/barcode/tambah", "create_barcodes", BarcodeLayout as unknown as Layout],
  ["master/kategori-barang/tambah", "create_item_categories", ItemCategoryLayout as unknown as Layout],
  [
    "master/kategori-pengeluaran/tambah",
    "manage_expense_categories",
    ExpenseCategoryLayout as unknown as Layout,
  ],
  ["master/pajak/tambah", "create_taxes", TaxLayout as unknown as Layout],
  ["master/satuan/tambah", "edit_units", UomLayout as unknown as Layout],
  ["master/syarat-pembayaran/tambah", "create_payment_terms", PaymentTermLayout as unknown as Layout],
  [
    "keuangan/angka-kunci-statistik/tambah",
    "create_accounts",
    SkfLayout as unknown as Layout,
  ],
]

describe("layout guard pada form tambah", () => {
  beforeEach(() => {
    requirePermissionMock.mockClear()
  })

  it.each(CASES)("%s menuntut izin %s", async (_path, permission, Layout) => {
    const children = "form"

    const rendered = await Layout({ children })

    expect(requirePermissionMock).toHaveBeenCalledTimes(1)
    expect(requirePermissionMock).toHaveBeenCalledWith(permission)
    // Guard tidak boleh mengubah apa yang dirender saat izinnya ada.
    expect(rendered).toBe(children)
  })
})
