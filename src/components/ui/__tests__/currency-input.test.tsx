// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

// Silence React 19 act environment warning
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { CurrencyInput } from "../currency-input"

function mountInto(node: HTMLElement) {
  const root: Root = createRoot(node)
  return { root, container: node }
}

function unmount(root: Root) {
  act(() => {
    root.unmount()
  })
}

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="text"]')
  if (!input) throw new Error("expected text input")
  return input as HTMLInputElement
}

function getHidden(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector('input[type="hidden"]') as HTMLInputElement | null
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
  if (!setter) throw new Error("no value setter")
  setter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("CurrencyInput controlled mode", () => {
  it("preserves the trailing comma while the parent still has the integer numeric value", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onChange = vi.fn()
    let value: number | string = 2500
    function Wrapper() {
      return <CurrencyInput value={value} onChange={(v) => {
        value = v
        onChange(v)
      }} />
    }
    const { root } = mountInto(container)
    act(() => {
      root.render(<Wrapper />)
    })
    const input = getInput(container)
    expect(input.value).toBe("2.500")

    // User types a trailing comma to start entering a decimal
    act(() => {
      setInputValue(input, "2.500,")
    })
    // The onChange callback should fire with the integer numeric value
    expect(onChange).toHaveBeenLastCalledWith(2500)
    // Critically, the trailing comma MUST remain in the visible input.
    // The bug was: visibleValue was forced to formatDisplay(controlledValue)
    // which strips any in-progress decimals.
    expect(input.value).toBe("2.500,")

    unmount(root)
    container.remove()
  })

  it("preserves trailing zero while user is finishing a decimal value", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onChange = vi.fn()
    let value: number | string = 2500.5
    function Wrapper() {
      return <CurrencyInput value={value} onChange={(v) => {
        value = v
        onChange(v)
      }} />
    }
    const { root } = mountInto(container)
    act(() => {
      root.render(<Wrapper />)
    })
    const input = getInput(container)
    expect(input.value).toBe("2.500,5")

    // User adds a trailing zero
    act(() => {
      setInputValue(input, "2.500,50")
    })
    expect(onChange).toHaveBeenLastCalledWith(2500.5)
    // Trailing zero MUST stay visible (the bug would collapse this to 2.500,5).
    expect(input.value).toBe("2.500,50")

    unmount(root)
    container.remove()
  })

  it("keeps the input empty when the user deletes all the digits", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onChange = vi.fn()
    let value: number | string = 2500
    function Wrapper() {
      return <CurrencyInput value={value} onChange={(v) => {
        value = v
        onChange(v)
      }} />
    }
    const { root } = mountInto(container)
    act(() => {
      root.render(<Wrapper />)
    })
    const input = getInput(container)
    expect(input.value).toBe("2.500")

    act(() => {
      setInputValue(input, "")
    })
    // onChange receives 0 because the user has nothing in the field,
    // but the visible field MUST stay empty (the bug would jump back to "0").
    expect(onChange).toHaveBeenLastCalledWith(0)
    expect(input.value).toBe("")

    unmount(root)
    container.remove()
  })

  it("resyncs the visible value when the parent externally changes the value to something numerically different", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onChange = vi.fn()
    let value: number | string = 2500
    function Wrapper() {
      return <CurrencyInput value={value} onChange={(v) => {
        value = v
        onChange(v)
      }} />
    }
    const { root } = mountInto(container)
    act(() => {
      root.render(<Wrapper />)
    })
    const input = getInput(container)
    expect(input.value).toBe("2.500")

    // Parent re-renders with a totally different value (e.g. server reload or form reset)
    act(() => {
      value = 9000
      root.render(<Wrapper />)
    })
    expect(input.value).toBe("9.000")

    unmount(root)
    container.remove()
  })

  it("formats the initial value on mount in controlled mode", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)
    act(() => {
      root.render(<CurrencyInput value={1500000} onChange={() => {}} />)
    })
    const input = getInput(container)
    expect(input.value).toBe("1.500.000")
    unmount(root)
    container.remove()
  })

  it("writes the numeric value to the hidden input so the form payload is correct", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)
    act(() => {
      root.render(<CurrencyInput name="amount" value={1234} onChange={() => {}} />)
    })
    const hidden = getHidden(container)
    expect(hidden?.value).toBe("1234")
    unmount(root)
    container.remove()
  })
})

describe("CurrencyInput uncontrolled mode", () => {
  it("uses defaultValue as the initial display", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { root } = mountInto(container)
    act(() => {
      root.render(<CurrencyInput defaultValue={50000} onChange={() => {}} />)
    })
    const input = getInput(container)
    expect(input.value).toBe("50.000")
    unmount(root)
    container.remove()
  })

  it("stays in its local state and never falls back to 0 when the user clears the field", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const onChange = vi.fn()
    const { root } = mountInto(container)
    act(() => {
      root.render(<CurrencyInput defaultValue={5000} onChange={onChange} />)
    })
    const input = getInput(container)
    expect(input.value).toBe("5.000")
    act(() => {
      setInputValue(input, "")
    })
    expect(input.value).toBe("")
    expect(onChange).toHaveBeenLastCalledWith(0)
    unmount(root)
    container.remove()
  })
})
