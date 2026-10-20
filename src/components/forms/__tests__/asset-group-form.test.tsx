// @vitest-environment jsdom
import { vi } from "vitest"
import { AssetGroupForm } from "../asset-group-form"
import { describeSingleFieldA11y } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/asset.actions", () => ({
  createAssetGroup: vi.fn().mockResolvedValue({ success: true }),
  updateAssetGroup: vi.fn().mockResolvedValue({ success: true }),
}))

describeSingleFieldA11y("AssetGroupForm", {
  component: AssetGroupForm,
  propName: "group",
  addLabel: "Formulir tambah grup aset",
  editLabel: "Formulir ubah grup aset",
  editName: "Kendaraan Operasional",
  requiredLabel: "Nama *",
})
