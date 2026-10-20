// @vitest-environment jsdom
import { describe, it, vi } from "vitest"
import { AssetGroupForm } from "../asset-group-form"
import { VehicleBrandForm } from "../vehicle-brand-form"
import { assertSingleFieldA11yAdd, assertSingleFieldA11yEdit } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/asset.actions", () => ({
  createAssetGroup: vi.fn().mockResolvedValue({ success: true }),
  updateAssetGroup: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("@/actions/vehicle.actions", () => ({ createVehicleBrand: vi.fn(), updateVehicleBrand: vi.fn() }))

// Direct `it` blocks in this file (not forwarded via helper) so Sonar S2187
// counts these as tests; mount/assert logic stays shared in the helper.
const assetGroupSpec = {
  component: AssetGroupForm,
  propName: "group",
  addLabel: "Formulir tambah grup aset",
  editLabel: "Formulir ubah grup aset",
  editName: "Kendaraan Operasional",
  requiredLabel: "Nama *",
}

const vehicleBrandSpec = {
  component: VehicleBrandForm,
  propName: "brand",
  addLabel: "Formulir tambah merek kendaraan",
  editLabel: "Formulir ubah merek kendaraan",
  editName: "Toyota",
  requiredLabel: "Nama Merek *",
}

describe("AssetGroupForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; input required; bintang dekoratif aria-hidden", () => {
    assertSingleFieldA11yAdd(assetGroupSpec)
  })
  it("mode ubah: label ubah + nama terisi", () => {
    assertSingleFieldA11yEdit(assetGroupSpec)
  })
})

describe("VehicleBrandForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; input required; bintang dekoratif aria-hidden", () => {
    assertSingleFieldA11yAdd(vehicleBrandSpec)
  })
  it("mode ubah: label ubah + nama terisi", () => {
    assertSingleFieldA11yEdit(vehicleBrandSpec)
  })
})
