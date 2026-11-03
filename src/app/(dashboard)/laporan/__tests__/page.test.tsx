// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import type { Root } from "react-dom/client"

const mocks = vi.hoisted(() => ({
  requireAnyPermission: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requireAnyPermission: mocks.requireAnyPermission,
}))

vi.mock("@/components/reports/report-catalog", () => ({
  ReportCatalog: ({ categories }: { categories: { label: string; reports: { label: string }[] }[] }) => (
    <div>
      {categories.map((category) => (
        <section key={category.label}>
          <h2>{category.label}</h2>
          {category.reports.map((report) => (
            <p key={report.label}>{report.label}</p>
          ))}
        </section>
      ))}
    </div>
  ),
}))

vi.mock("@/components/ui/breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}))

import ReportsPage from "../page"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
})

describe("ReportsPage katalog (putaran 92)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("pemegang view_reports tidak ditawari laporan payroll yang loader-nya menolak", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["view_reports"],
    })

    const node = await ReportsPage()
    const { container, root } = renderPageNode(node)
    roots.push(root)

    expect(mocks.requireAnyPermission).toHaveBeenCalledWith(
      expect.arrayContaining(["view_reports", "view_payroll_reports"]),
    )
    expect(container.textContent).toContain("Laba Rugi (Standar)")
    expect(container.textContent).not.toContain("Gaji Karyawan")
    expect(container.textContent).not.toContain("PPh 21 Karyawan")
    expect(container.textContent).not.toContain("Porsi Gaji")
    expect(container.textContent).not.toContain("Rekap Borongan")
  })

  it("pemegang view_payroll_reports saja bisa membuka hub dan hanya melihat laporan payroll", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["view_payroll_reports"],
    })

    const node = await ReportsPage()
    const { container, root } = renderPageNode(node)
    roots.push(root)

    expect(container.textContent).toContain("Gaji Karyawan")
    expect(container.textContent).toContain("PPh 21 Karyawan")
    expect(container.textContent).toContain("Porsi Gaji")
    expect(container.textContent).toContain("Rekap Borongan")
    expect(container.textContent).not.toContain("Laba Rugi (Standar)")
  })
})
