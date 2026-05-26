import { create } from "zustand"

interface SidebarState {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: true,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))

interface NotificationState {
  unreadCount: number
  setUnreadCount: (count: number) => void
  increment: () => void
  decrement: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  increment: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  decrement: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
}))

interface GlobalState {
  currentCompany: string
  setCurrentCompany: (name: string) => void
}

export const useGlobalStore = create<GlobalState>((set) => ({
  currentCompany: "Yara ERP",
  setCurrentCompany: (name) => set({ currentCompany: name }),
}))
