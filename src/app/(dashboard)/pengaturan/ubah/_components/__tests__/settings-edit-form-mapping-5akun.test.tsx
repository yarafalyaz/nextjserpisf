// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { SettingsEditForm } from "../settings-edit-form"
import { updateSystemSettings } from "@/actions/settings.actions"
import { ACCOUNT_MAPPING_FIELDS } from "@/lib/utils/account-automap"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/settings.actions", () => ({ updateSystemSettings: vi.fn() }))

const updateMock = vi.mocked(updateSystemSettings)

// Kode + nama sengaja memakai code persis dari ACCOUNT_MAPPING_RULES supaya
// auto-map pasti menemukan kelimanya (pencocokan token kode/nama).
const ACCOUNTS = [
  { id: 102, code: "210102", name: "Uang Muka Penjualan", type: "LIABILITY" },
  { id: 104, code: "510104", name: "Beban Garansi", type: "EXPENSE" },
  { id: 205, code: "210205", name: "Provisi Garansi", type: "LIABILITY" },
  { id: 508, code: "110508", name: "Piutang Klaim Supplier", type: "ASSET" },
  { id: 209, code: "210209", name: "Utang Reimbursement", type: "LIABILITY" },
] as unknown as Parameters<typeof SettingsEditForm>[0]["accounts"]

function mount(settings: Record<string, unknown>) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(<SettingsEditForm settings={settings} accounts={ACCOUNTS} section="accounts" />)
  })
  return { container, root }
}

function unmount(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}

function hiddenValue(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value
}

function clickAutoMap(container: HTMLElement) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Pemetaan Otomatis Akun",
  )
  expect(button).toBeTruthy()
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

describe("SettingsEditForm — lima mapping akun fail-closed (t_59255e54)", () => {
  it("tidak ada satu pun kunci ACCOUNT_MAPPING_FIELDS yang kehilangan input di form", () => {
    const { container, root } = mount({})
    const names = new Set(
      Array.from(container.querySelectorAll<HTMLInputElement>("input[name]")).map((el) => el.name),
    )
    const missing = ACCOUNT_MAPPING_FIELDS.filter((key) => !names.has(key))
    // Checklist mapping di /pengaturan/penyelesaian menuntut SEMUA kunci ini terisi;
    // kunci tanpa input = tuntutan yang tak bisa dipenuhi pengguna.
    expect(missing).toEqual([])
    expect(ACCOUNT_MAPPING_FIELDS.length).toBeGreaterThanOrEqual(39)
    unmount(root, container)
  })

  it("merender lima pemilih akun dengan nilai tersimpan", () => {
    const { container, root } = mount({
      customerDownPaymentAccountId: 102,
      warrantyExpenseAccountId: 104,
      warrantyProvisionAccountId: 205,
      supplierClaimReceivableAccountId: 508,
      reimbursementLiabilityAccountId: 209,
    })
    expect(hiddenValue(container, "customerDownPaymentAccountId")).toBe("102")
    expect(hiddenValue(container, "warrantyExpenseAccountId")).toBe("104")
    expect(hiddenValue(container, "warrantyProvisionAccountId")).toBe("205")
    expect(hiddenValue(container, "supplierClaimReceivableAccountId")).toBe("508")
    expect(hiddenValue(container, "reimbursementLiabilityAccountId")).toBe("209")
    const labels = Array.from(container.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(
      expect.arrayContaining([
        "Uang Muka Penjualan (Liabilitas)",
        "Beban Garansi (510104)",
        "Provisi Garansi (210205)",
        "Piutang Klaim Supplier (110508)",
        "Utang Reimbursement (210209)",
      ]),
    )
    unmount(root, container)
  })

  it("pemetaan otomatis mengisi kelima kunci, bukan membuangnya", () => {
    const { container, root } = mount({})
    clickAutoMap(container)
    expect(hiddenValue(container, "customerDownPaymentAccountId")).toBe("102")
    expect(hiddenValue(container, "warrantyExpenseAccountId")).toBe("104")
    expect(hiddenValue(container, "warrantyProvisionAccountId")).toBe("205")
    expect(hiddenValue(container, "supplierClaimReceivableAccountId")).toBe("508")
    expect(hiddenValue(container, "reimbursementLiabilityAccountId")).toBe("209")
    unmount(root, container)
  })

  it("submit mengirim kelima kunci ke updateSystemSettings", async () => {
    updateMock.mockResolvedValue(undefined as never)
    const { container, root } = mount({
      customerDownPaymentAccountId: 102,
      warrantyExpenseAccountId: 104,
      warrantyProvisionAccountId: 205,
      supplierClaimReceivableAccountId: 508,
      reimbursementLiabilityAccountId: 209,
    })
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(updateMock).toHaveBeenCalledTimes(1)
    const fd = updateMock.mock.calls[0][0] as FormData
    expect(fd.get("customerDownPaymentAccountId")).toBe("102")
    expect(fd.get("warrantyExpenseAccountId")).toBe("104")
    expect(fd.get("warrantyProvisionAccountId")).toBe("205")
    expect(fd.get("supplierClaimReceivableAccountId")).toBe("508")
    expect(fd.get("reimbursementLiabilityAccountId")).toBe("209")
    unmount(root, container)
  })
})
