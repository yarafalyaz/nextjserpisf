import { describe, it, expect, beforeEach } from "vitest"
import {
  useSidebarStore,
  useNotificationStore,
  useGlobalStore,
} from "../index"

beforeEach(() => {
  useSidebarStore.setState({ isOpen: true })
  useNotificationStore.setState({ unreadCount: 0 })
  useGlobalStore.setState({ currentCompany: "Yara ERP" })
})

describe("useSidebarStore", () => {
  it("starts open", () => {
    expect(useSidebarStore.getState().isOpen).toBe(true)
  })

  it("toggle flips the open state", () => {
    useSidebarStore.getState().toggle()
    expect(useSidebarStore.getState().isOpen).toBe(false)
    useSidebarStore.getState().toggle()
    expect(useSidebarStore.getState().isOpen).toBe(true)
  })

  it("open() and close() set explicit states", () => {
    useSidebarStore.getState().close()
    expect(useSidebarStore.getState().isOpen).toBe(false)
    useSidebarStore.getState().open()
    expect(useSidebarStore.getState().isOpen).toBe(true)
  })
})

describe("useNotificationStore", () => {
  it("setUnreadCount sets an absolute value", () => {
    useNotificationStore.getState().setUnreadCount(7)
    expect(useNotificationStore.getState().unreadCount).toBe(7)
  })

  it("increment raises the count by one", () => {
    useNotificationStore.getState().increment()
    useNotificationStore.getState().increment()
    expect(useNotificationStore.getState().unreadCount).toBe(2)
  })

  it("decrement lowers the count by one", () => {
    useNotificationStore.getState().setUnreadCount(3)
    useNotificationStore.getState().decrement()
    expect(useNotificationStore.getState().unreadCount).toBe(2)
  })

  it("decrement never goes below zero", () => {
    useNotificationStore.getState().decrement()
    expect(useNotificationStore.getState().unreadCount).toBe(0)
  })
})

describe("useGlobalStore", () => {
  it("has a default company name", () => {
    expect(useGlobalStore.getState().currentCompany).toBe("Yara ERP")
  })

  it("setCurrentCompany updates the name", () => {
    useGlobalStore.getState().setCurrentCompany("Bengkel Maju")
    expect(useGlobalStore.getState().currentCompany).toBe("Bengkel Maju")
  })
})
