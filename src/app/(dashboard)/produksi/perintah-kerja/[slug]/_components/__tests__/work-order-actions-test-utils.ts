import { vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement, type ComponentProps, type ComponentType } from "react"

// Fixture bersama tes WorkOrderActions (intake + pengeluaran material):
// blok mock + render identik pernah tersalin di dua berkas dan memicu
// duplikasi Sonar (PR #1232 13,3%); simpan sekali di sini.
// Komponen diteruskan pemanggil: modul ini TIDAK mengimpor komponen,
// supaya factory vi.mock yang memuat modul ini tidak sirkular dengan
// komponen yang sedang dimock aksinya.
// Aksi server menyeret rantai auth yang tak bisa dimuat di vitest; yang
// diuji pemetaan fakta -> tombol, bukan aksinya.
export const workOrderActionsRouterModule = {
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}

export const workOrderActionsManufacturingModule = {
  startWorkOrder: vi.fn(async () => ({ success: true })),
  completeWorkOrder: vi.fn(async () => ({ success: true })),
  createMaterialIssueFromWorkOrder: vi.fn(async () => ({ success: true })),
}

export const workOrderActionsInventoryModule = {
  reviseWorkOrderItems: vi.fn(async () => ({ success: true })),
}

type ActionsProps = ComponentProps<
  ComponentType<{
    workOrderId: number
    status: string
    hasCompletedMaterialIssue: boolean
    hasActiveMaterialIssue?: boolean
    defaultWarehouseId: number | null
    vehicleIntakeBlocked?: boolean
    vehicleIntakeHref?: string
  }>
>

export function renderWorkOrderActions(
  component: ComponentType<ActionsProps>,
  props: Partial<ActionsProps> = {},
  defaults: Partial<ActionsProps> = {},
) {
  return renderToStaticMarkup(
    createElement(component, {
      workOrderId: 7,
      status: "draft",
      hasCompletedMaterialIssue: false,
      defaultWarehouseId: 1,
      ...defaults,
      ...props,
    }),
  )
}
