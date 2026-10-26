// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { CustomerForm } from "../customer-form"
import { createCustomer } from "@/actions/master.actions"
import {
  mountInto,
  unmount,
  submitFilledForm,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/master.actions", () => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}))
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

const mockedCreate = vi.mocked(createCustomer)

describe("CustomerForm — identitas pajak F-2026-10-25-004-S", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("field identitas pajak tampil dengan label terikat", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <CustomerForm />)
    for (const id of ["taxpayerName", "taxAddress", "nitku", "pkpStatus", "pkpEffectiveFrom", "pkpSource"]) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull()
    }
    expect(container.querySelector('label[for="taxpayerName"]')?.textContent).toContain("Nama Wajib Pajak")
    expect(container.querySelector('label[for="pkpStatus"]')?.textContent).toContain("Status PKP")
    // Vonis §8: status PKP tidak menurunkan kode transaksi — penanda jujur tampil.
    expect(container.textContent).toContain("Status PKP tidak menentukan kode transaksi faktur.")
    expect(container.textContent).not.toContain("NPWP valid")
    unmount(root, container)
  })

  it("taxWarnings server tampil verbatim + navigasi ditunda", async () => {
    mockedCreate.mockResolvedValue({
      success: true,
      id: 10,
      slug: "budi-baru",
      duplicateWarning: null,
      taxWarnings: [
        "NPWP 15 digit — minta NPWP 16 digit/NIK lawan; sejak 1 Jul 2024 layanan memakai format 16 digit",
      ],
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <CustomerForm />)
    await submitFilledForm(container)
    expect(container.textContent).toContain("Peringatan identitas pajak")
    expect(container.textContent).toContain(
      "NPWP 15 digit — minta NPWP 16 digit/NIK lawan; sejak 1 Jul 2024 layanan memakai format 16 digit",
    )
    unmount(root, container)
  })

  it("tanpa taxWarnings: nol panel peringatan pajak", async () => {
    mockedCreate.mockResolvedValue({
      success: true,
      id: 10,
      slug: "budi-baru",
      duplicateWarning: null,
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <CustomerForm />)
    await submitFilledForm(container)
    expect(container.textContent).not.toContain("Peringatan identitas pajak")
    unmount(root, container)
  })
})
