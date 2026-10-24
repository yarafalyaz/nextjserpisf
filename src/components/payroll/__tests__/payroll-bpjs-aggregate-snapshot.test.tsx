// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { createElement, type ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { act } from "react"
import { PayrollBpjsAggregateSnapshot } from "../payroll-bpjs-aggregate-snapshot"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function render(element: ReactElement): HTMLElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(element) })
  return container
}

describe("PayrollBpjsAggregateSnapshot (F-103-V/B6, read-only)", () => {
  it("tanpa penanda bpjsAggregate -> tidak render apa pun (slip legacy)", () => {
    expect(render(createElement(PayrollBpjsAggregateSnapshot, { snapshot: {} })).innerHTML).toBe("")
    expect(render(createElement(PayrollBpjsAggregateSnapshot, { snapshot: null })).innerHTML).toBe("")
  })

  it("snapshot valid -> tampilkan basis, target masa, dan terakumulasi sebelumnya apa adanya", () => {
    const container = render(createElement(PayrollBpjsAggregateSnapshot, {
      snapshot: {
        bpjsAggregate: {
          basis: 8000000, targetHealth: 80000, targetEmployment: 160000,
          withheldHealth: 40000, withheldEmployment: 80000,
        },
      },
    }))
    expect(container.textContent).toContain("Snapshot Agregat BPJS Se-Masa")
    expect(container.textContent).toContain("Rp 8.000.000")
    expect(container.textContent).toContain("Rp 80.000")
    expect(container.textContent).toContain("Rp 160.000")
    expect(container.textContent).toContain("Rp 40.000")
    const rootHtml = container.innerHTML
    expect(rootHtml).not.toContain("<input")
    expect(rootHtml).not.toContain("<button")
  })
})
