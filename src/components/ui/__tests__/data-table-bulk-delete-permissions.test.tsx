// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let sessionUser: { permissions?: string[]; roles?: string[] } | null = {
  permissions: [],
  roles: [],
}

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
  usePathname: () => "/master/pelanggan",
  useSearchParams: () => new URLSearchParams(),
}))

import { createRoot } from "react-dom/client"
import { act } from "react"
import { createColumnHelper } from "@/lib/table"

import { setupJsdomTableStubs } from "./data-table-test-utils"
import { DataTable } from "../data-table"
import {
  BULK_DELETE_PERMISSIONS,
  BULK_DELETE_REQUIRES_INDIVIDUAL,
  type BulkDeleteModel,
} from "@/lib/auth/bulk-delete-models"

setupJsdomTableStubs()

interface Row {
  id: number
  name: string
}

const columnHelper = createColumnHelper<Row>()
const columns = [
  columnHelper.accessor("name", { header: "Nama", cell: (info) => info.getValue() }),
]

function renderTable(props: {
  onBulkDelete?: (ids: number[]) => Promise<{ success: boolean }>
  bulkDeletePermission?: string
  withUser?: boolean
}) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <DataTable
        data={[{ id: 1, name: "Satu" }]}
        columns={columns}
        ariaLabel="Tabel uji"
        onBulkDelete={props.onBulkDelete}
        bulkDeletePermission={props.bulkDeletePermission}
        bulkDeleteUser={props.withUser === false ? undefined : sessionUser}
      />,
    )
  })
  return { container, root }
}

function selectFirstRow(container: HTMLElement) {
  const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]')
  expect(checkbox).not.toBeNull()
  act(() => {
    checkbox!.click()
  })
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("DataTable bulk delete gerbang izin", () => {
  beforeEach(() => {
    sessionUser = { permissions: [], roles: [] }
  })

  it("pemegang izin delete melihat Hapus Terpilih sesudah memilih baris", () => {
    sessionUser = { permissions: ["delete_customers"], roles: [] }
    const { container, root } = renderTable({
      onBulkDelete: async () => ({ success: true }),
      bulkDeletePermission: "delete_customers",
    })
    selectFirstRow(container)
    expect(container.textContent).toContain("Hapus Terpilih")
    cleanup(root, container)
  })

  it("tanpa izin delete: Hapus Terpilih absen (bar massal tak tampil tanpa aksi lain)", () => {
    sessionUser = { permissions: [], roles: [] }
    const { container, root } = renderTable({
      onBulkDelete: async () => ({ success: true }),
      bulkDeletePermission: "delete_customers",
    })
    selectFirstRow(container)
    expect(container.textContent).not.toContain("Hapus Terpilih")
    expect(container.textContent).not.toContain("data dipilih")
    cleanup(root, container)
  })

  it("super_admin melihat Hapus Terpilih tanpa izin eksplisit", () => {
    sessionUser = { permissions: [], roles: ["super_admin"] }
    const { container, root } = renderTable({
      onBulkDelete: async () => ({ success: true }),
      bulkDeletePermission: "delete_customers",
    })
    selectFirstRow(container)
    expect(container.textContent).toContain("Hapus Terpilih")
    cleanup(root, container)
  })

  it("tanpa prop bulkDeletePermission: pemanggil lama tak berubah (tombol tampil)", () => {
    sessionUser = { permissions: [], roles: [] }
    const { container, root } = renderTable({
      onBulkDelete: async () => ({ success: true }),
      withUser: false,
    })
    selectFirstRow(container)
    expect(container.textContent).toContain("Hapus Terpilih")
    cleanup(root, container)
  })

  it("izin diteruskan tanpa pengguna sesi: tombol sembunyi (fail-closed)", () => {
    const { container, root } = renderTable({
      onBulkDelete: async () => ({ success: true }),
      bulkDeletePermission: "delete_customers",
      withUser: false,
    })
    selectFirstRow(container)
    expect(container.textContent).not.toContain("Hapus Terpilih")
    cleanup(root, container)
  })
})

describe("kontrak bulk delete bersama server/client", () => {
  it("server bulkDelete membaca peta bersama, bukan peta lokal", () => {
    const src = source("src/actions/bulk.actions.ts")
    expect(src).toContain('from "@/lib/auth/bulk-delete-models"')
    expect(src).toContain("BULK_DELETE_PERMISSIONS")
    expect(src).toContain("BULK_DELETE_REQUIRES_INDIVIDUAL")
    expect(src).not.toContain("const modelPermissionMap: Record<ModelName, PermissionName>")
  })

  it("5 tabel model boleh: BULK_MODEL tak masuk daftar individual + izin diteruskan", () => {
    const expected: Array<{ file: string; model: BulkDeleteModel; permission: string }> = [
      { file: "src/app/(dashboard)/master/pelanggan/_components/customer-table.tsx", model: "customer", permission: "delete_customers" },
      { file: "src/app/(dashboard)/master/barang/_components/item-table.tsx", model: "item", permission: "delete_items" },
      { file: "src/app/(dashboard)/kendaraan/fitment/_components/vehicle-fitment-table.tsx", model: "vehicleFitmentRule", permission: "delete_vehicle_fitments" },
      { file: "src/app/(dashboard)/master/vendor/_components/vendor-table.tsx", model: "vendor", permission: "delete_vendors" },
      { file: "src/app/(dashboard)/master/gudang/_components/warehouse-table.tsx", model: "warehouse", permission: "delete_warehouses" },
    ]
    for (const { file, model, permission } of expected) {
      expect(BULK_DELETE_REQUIRES_INDIVIDUAL.has(model), model).toBe(false)
      expect(BULK_DELETE_PERMISSIONS[model]).toBe(permission)
      const src = source(file)
      expect(src, file).toContain(`const BULK_MODEL: BulkDeleteModel = "${model}"`)
      expect(src, file).toContain("bulkDelete(BULK_MODEL, ids)")
      expect(src, file).toContain("bulkDeletePermission={BULK_DELETE_PERMISSIONS[BULK_MODEL]}")
      expect(src, file).toContain("bulkDeleteUser={bulkDeleteUser}")
      expect(src, file).toContain("useBulkDeleteSessionUser()")
    }
  })

  it("tabel model individual-only tidak lagi menawarkan onBulkDelete", () => {
    const dead: Array<[string, BulkDeleteModel]> = [
      ["src/app/(dashboard)/keuangan/jurnal/_components/journal-table.tsx", "journal"],
      ["src/app/(dashboard)/penjualan/faktur/_components/invoice-table.tsx", "salesInvoice"],
      ["src/app/(dashboard)/pembelian/pesanan/_components/purchase-order-table.tsx", "purchaseOrder"],
      ["src/app/(dashboard)/master/karyawan/_components/employee-table.tsx", "employee"],
      ["src/app/(dashboard)/sdm/pinjaman/_components/loan-table.tsx", "loan"],
      ["src/app/(dashboard)/inventaris/transfer/_components/transfer-table.tsx", "stockTransfer"],
      ["src/app/(dashboard)/pengaturan/persetujuan/_components/approval-table.tsx", "approval"],
      ["src/app/(dashboard)/aset/_components/asset-table.tsx", "asset"],
      // ROUND5-SCOPE: apresiasi terikat cakupan HR per karyawan.
      ["src/app/(dashboard)/sdm/apresiasi/_components/appreciation-table.tsx", "appreciation"],
      // Produk: delete tunggal menjaga referensi ProductionOrder/BOM/QC.
      ["src/app/(dashboard)/produksi/products/_components/product-table.tsx", "product"],
      // Metode bayar/kirim: delete tunggal menolak kode yang masih dirujuk
      // dokumen lewat string polos (putaran 21) — bulk mentah memutusnya.
      ["src/app/(dashboard)/master/metode-pembayaran/_components/payment-method-table.tsx", "paymentMethod"],
      ["src/app/(dashboard)/master/metode-pengiriman/_components/shipping-method-table.tsx", "shippingMethod"],
      // Lead beraktivitas wajib soft-delete per baris (deleteLead): hapus
      // massal mentah = hard delete + cascade musnahkan histori aktivitas.
      ["src/app/(dashboard)/crm/leads/_components/lead-table.tsx", "lead"],
    ]
    for (const [file, model] of dead) {
      expect(BULK_DELETE_REQUIRES_INDIVIDUAL.has(model), model).toBe(true)
      expect(source(file), file).not.toContain("onBulkDelete")
    }
  })
})
