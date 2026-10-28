// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

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

// Lima akun yang diaudit QA 28 Okt 2026: dibaca hook uang + aturan auto-map,
// tetapi sebelumnya tidak punya input sama sekali di form pengaturan akuntansi.
const ORPHAN_FIELDS = [
  "customerDownPaymentAccountId",
  "warrantyExpenseAccountId",
  "warrantyProvisionAccountId",
  "supplierClaimReceivableAccountId",
  "reimbursementLiabilityAccountId",
] as const

const COA = [
  { id: 11, code: "110508", name: "Piutang Klaim Supplier" },
  { id: 21, code: "210102", name: "Uang Muka Penjualan" },
  { id: 22, code: "210205", name: "Provisi Garansi" },
  { id: 23, code: "210209", name: "Utang Reimbursement" },
  { id: 51, code: "510104", name: "Beban Garansi" },
]

function mount(settings: Record<string, unknown>, section: "accounts" | "company" = "accounts") {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(<SettingsEditForm settings={settings} accounts={COA} section={section} />)
  })
  return { container, root }
}

function unmount(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}

function hiddenValue(container: HTMLElement, name: string): string | undefined {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  return input?.value
}

function clickAutoMap(container: HTMLElement) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Pemetaan Otomatis Akun",
  )
  expect(button).toBeDefined()
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

describe("SettingsEditForm — 5 akun yatim (SAL-BR-004 / GL-BR-009)", () => {
  beforeEach(() => {
    updateMock.mockReset()
  })

  it("setiap kunci ACCOUNT_MAPPING_FIELDS punya input di seksi akuntansi", () => {
    const { container, root } = mount({})
    const missing = ACCOUNT_MAPPING_FIELDS.filter((key) => hiddenValue(container, key) === undefined)
    // BR-LOAN-08 (162-V): input mapping write-off ikut kartu UI Frontend
    // t_b1e5edbd; backend kunci sudah live (automap + settings.actions validasi).
    const pendingUi = ["employeeLoanWriteOffExpenseAccountId"]
    expect(missing.filter((key) => !pendingUi.includes(key))).toEqual([])
    expect(ACCOUNT_MAPPING_FIELDS).toHaveLength(40)
    for (const key of ORPHAN_FIELDS) {
      expect(container.querySelector(`input[name="${key}"]`)).not.toBeNull()
      expect(container.querySelector(`label[for="${key}"]`)).not.toBeNull()
    }
    unmount(root, container)
  })

  it("tombol auto-map mengisi kelima akun yatim (hasil resolveAllAccountMappings tidak dibuang)", () => {
    const { container, root } = mount({})
    expect(hiddenValue(container, "customerDownPaymentAccountId")).toBe("")
    expect(hiddenValue(container, "warrantyExpenseAccountId")).toBe("")

    clickAutoMap(container)

    expect(hiddenValue(container, "customerDownPaymentAccountId")).toBe("21")
    expect(hiddenValue(container, "warrantyExpenseAccountId")).toBe("51")
    expect(hiddenValue(container, "warrantyProvisionAccountId")).toBe("22")
    expect(hiddenValue(container, "supplierClaimReceivableAccountId")).toBe("11")
    expect(hiddenValue(container, "reimbursementLiabilityAccountId")).toBe("23")
    unmount(root, container)
  })

  it("nilai tersimpan kelima akun yatim dirender kembali di form", () => {
    const { container, root } = mount({
      customerDownPaymentAccountId: 21,
      warrantyExpenseAccountId: 51,
      warrantyProvisionAccountId: 22,
      supplierClaimReceivableAccountId: 11,
      reimbursementLiabilityAccountId: 23,
    })
    expect(hiddenValue(container, "customerDownPaymentAccountId")).toBe("21")
    expect(hiddenValue(container, "warrantyExpenseAccountId")).toBe("51")
    expect(hiddenValue(container, "warrantyProvisionAccountId")).toBe("22")
    expect(hiddenValue(container, "supplierClaimReceivableAccountId")).toBe("11")
    expect(hiddenValue(container, "reimbursementLiabilityAccountId")).toBe("23")
    const labels = Array.from(container.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(
      expect.arrayContaining([
        "Uang Muka Penjualan / DP (210102)",
        "Beban Garansi (510104)",
        "Provisi Garansi (210205)",
        "Piutang Klaim Supplier (110508)",
        "Utang Reimbursement (210209)",
      ]),
    )
    unmount(root, container)
  })

  it("submit mengirim kelima akun yatim di FormData", async () => {
    updateMock.mockResolvedValue(undefined as never)
    const { container, root } = mount({
      customerDownPaymentAccountId: 21,
      warrantyExpenseAccountId: 51,
      warrantyProvisionAccountId: 22,
      supplierClaimReceivableAccountId: 11,
      reimbursementLiabilityAccountId: 23,
    })
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(updateMock).toHaveBeenCalledTimes(1)
    const formData = updateMock.mock.calls[0][0] as FormData
    expect(formData.get("customerDownPaymentAccountId")).toBe("21")
    expect(formData.get("warrantyExpenseAccountId")).toBe("51")
    expect(formData.get("warrantyProvisionAccountId")).toBe("22")
    expect(formData.get("supplierClaimReceivableAccountId")).toBe("11")
    expect(formData.get("reimbursementLiabilityAccountId")).toBe("23")
    unmount(root, container)
  })
})
