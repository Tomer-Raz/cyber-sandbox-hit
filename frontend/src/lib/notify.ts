import { useEffect } from 'react'
import { App } from 'antd'

type NotifyApis = ReturnType<typeof App.useApp>

// Held outside React so `toast` stays callable from plain event handlers.
let messageApi: NotifyApis['message'] | null = null
let notificationApi: NotifyApis['notification'] | null = null

/**
 * Registers antd's context-aware message/notification instances.
 * Render once inside <App> so toasts pick up the ConfigProvider theme
 * (antd's static methods cannot read context).
 */
export function NotificationBridge(): null {
  const { message, notification } = App.useApp()
  useEffect(() => {
    messageApi = message
    notificationApi = notification
  }, [message, notification])
  return null
}

type Variant = 'success' | 'error' | 'info' | 'warning'

function notify(variant: Variant, title: string, description?: string): void {
  if (description) {
    notificationApi?.[variant]({ message: title, description, placement: 'topRight' })
  } else {
    void messageApi?.[variant](title)
  }
}

/** Title only → compact message. Title + description → notification. */
export const toast = {
  success: (title: string, description?: string) => notify('success', title, description),
  error: (title: string, description?: string) => notify('error', title, description),
  info: (title: string, description?: string) => notify('info', title, description),
  warning: (title: string, description?: string) => notify('warning', title, description),
}
