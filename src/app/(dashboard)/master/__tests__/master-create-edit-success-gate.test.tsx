// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactElement } from "react"

const pushMock = vi.fn()
const refreshMock = vi.fn()
const { showSuccessMock, showErrorMock, m } = vi.hoisted(() => {
  const ok = async (): Promise<{ success: boolean; error?: string }> => ({ success: true })
  return {
    showSuccessMock: vi.fn(),
    showErrorMock: vi.fn(),
    m: {
      createBarcode: vi.fn(ok), createBank: vi.fn(ok), updateBank: vi.fn(ok),
      createTax: vi.fn(ok), updateTax: vi.fn(ok),
      createDepartment: vi.fn(ok), updateDepartment: vi.fn(ok),
      createPosition: vi.fn(ok), updatePosition: vi.fn(ok),
      createPaymentTerm: vi.fn(ok), updatePaymentTerm: vi.fn(ok),
    },
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock, back: vi.fn() }),
}))
vi.mock("@/actions/master.actions", () => m)
vi.mock("@/lib/utils/toast", () => ({ showSuccess: showSuccessMock, showError: showErrorMock }))
vi.mock("@/components/ui/button", async () => await import("@/components/payroll/__tests__/button-mock"))
vi.mock("@/components/ui/breadcrumbs", () => ({ AppBreadcrumbs: () => null }))
vi.mock("@/components/ui/date-picker", () => ({ AppDatePicker: () => null }))
vi.mock("@/components/ui/shadcn/checkbox", () => ({
  Checkbox: ({ id, name }: { id?: string; name?: string }) => <input type="checkbox" id={id} name={name} />,
}))
vi.mock("@/components/ui/form-select", () => ({
  FormSelect: ({ id, name, defaultValue }: { id?: string; name?: string; defaultValue?: string }) => (
    <input id={id} name={name} defaultValue={defaultValue ?? ""} readOnly />
  ),
}))

import { mount, act } from "@/components/payroll/__tests__/mount"
import CreateBarcodePage from "../barcode/tambah/page"
import CreateBankPage from "../bank/tambah/page"
import { EditBankForm } from "../bank/[slug]/ubah/form"
import CreateTaxPage from "../pajak/tambah/page"
import { TaxEditForm } from "../pajak/[slug]/ubah/form"
import { DepartmentCreateForm } from "../departemen/tambah/form"
import { EditDepartmentForm } from "../departemen/[slug]/ubah/form"
import { PositionCreateForm } from "../jabatan/tambah/form"
import CreatePaymentTermPage from "../syarat-pembayaran/tambah/page"
import { EditPaymentTermForm } from "../syarat-pembayaran/[slug]/ubah/form"

async function submit(node: ReactElement) {
  const mounted = mount(node)
  const form = mounted.container.querySelector("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await act(async () => {})
  return mounted
}

const ERROR = "Validasi server gagal"

describe("Master tambah/ubah — gerbang sukses palsu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of Object.values(m)) fn.mockResolvedValue({ success: true })
  })

  const failCases: [string, () => ReactElement, () => unknown, string][] = [
    ["barcode tambah", () => <CreateBarcodePage />, () => m.createBarcode, "/master/barcode"],
    ["bank tambah", () => <CreateBankPage />, () => m.createBank, "/master/bank"],
    ["bank ubah", () => <EditBankForm bank={{ id: 1, name: "BCA", code: "BCA", accountId: null, type: "bank" }} />, () => m.updateBank, "/master/bank"],
    ["pajak tambah", () => <CreateTaxPage />, () => m.createTax, "/master/pajak"],
    ["pajak ubah", () => <TaxEditForm tax={{ id: 1, name: "PPN", rate: 11 }} />, () => m.updateTax, "/master/pajak"],
    ["departemen tambah", () => <DepartmentCreateForm />, () => m.createDepartment, "/master/departemen"],
    ["departemen ubah", () => <EditDepartmentForm department={{ id: 1, name: "Ops", code: null, description: null }} />, () => m.updateDepartment, "/master/departemen"],
    ["jabatan tambah", () => <PositionCreateForm departments={[]} />, () => m.createPosition, "/master/jabatan"],
    ["jabatan ubah", () => <PositionCreateForm departments={[]} position={{ id: 1, name: "Staff", departmentId: null }} />, () => m.updatePosition, "/master/jabatan"],
    ["termin tambah", () => <CreatePaymentTermPage />, () => m.createPaymentTerm, "/master/syarat-pembayaran"],
    ["termin ubah", () => <EditPaymentTermForm paymentTerm={{ id: 1, name: "Net 30", code: "NET30", days: 30 }} />, () => m.updatePaymentTerm, "/master/syarat-pembayaran"],
  ]

  for (const [name, render, action, path] of failCases) {
    it(`${name}: {success:false} → showError, tanpa push`, async () => {
      ;(action() as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: ERROR })
      const { root } = await submit(render())
      expect(showErrorMock).toHaveBeenCalledWith(ERROR)
      expect(showSuccessMock).not.toHaveBeenCalled()
      expect(pushMock).not.toHaveBeenCalledWith(path)
      expect(pushMock).not.toHaveBeenCalled()
      root.unmount()
    })
  }

  it("bank tambah {success:true} → tetap push", async () => {
    const { root } = await submit(<CreateBankPage />)
    expect(showErrorMock).not.toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith("/master/bank")
    root.unmount()
  })

  it("jabatan ubah {success:true} → tetap push", async () => {
    const { root } = await submit(
      <PositionCreateForm departments={[]} position={{ id: 1, name: "Staff", departmentId: null }} />,
    )
    expect(showErrorMock).not.toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith("/master/jabatan")
    root.unmount()
  })
})
