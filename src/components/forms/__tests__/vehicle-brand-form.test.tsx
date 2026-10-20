// @vitest-environment jsdom
import { vi } from "vitest"
import { VehicleBrandForm } from "../vehicle-brand-form"
import { describeSingleFieldA11y } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/vehicle.actions", () => ({ createVehicleBrand: vi.fn(), updateVehicleBrand: vi.fn() }))

describeSingleFieldA11y("VehicleBrandForm", {
  component: VehicleBrandForm,
  propName: "brand",
  addLabel: "Formulir tambah merek kendaraan",
  editLabel: "Formulir ubah merek kendaraan",
  editName: "Toyota",
  requiredLabel: "Nama Merek *",
})
