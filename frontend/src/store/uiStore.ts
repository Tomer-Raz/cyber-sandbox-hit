import { create } from 'zustand'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  title: string
  message?: string
  variant: ToastVariant
  duration: number
}

interface UiState {
  toasts: Toast[]
  pushToast: (t: Partial<Toast> & { title: string }) => string
  dismissToast: (id: string) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

let toastSeq = 0

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  pushToast: (t) => {
    const id = `t${++toastSeq}`
    const toast: Toast = {
      id,
      title: t.title,
      message: t.message,
      variant: t.variant ?? 'info',
      duration: t.duration ?? 4200,
    }
    set((s) => ({ toasts: [...s.toasts, toast] }))
    return id
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))

// Ergonomic helper usable outside React components.
export const toast = {
  show: (title: string, opts?: Partial<Toast>) =>
    useUiStore.getState().pushToast({ title, ...opts }),
  success: (title: string, message?: string) =>
    useUiStore.getState().pushToast({ title, message, variant: 'success' }),
  error: (title: string, message?: string) =>
    useUiStore.getState().pushToast({ title, message, variant: 'error' }),
  info: (title: string, message?: string) =>
    useUiStore.getState().pushToast({ title, message, variant: 'info' }),
  warning: (title: string, message?: string) =>
    useUiStore.getState().pushToast({ title, message, variant: 'warning' }),
}
