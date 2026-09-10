"use client"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"

/**
 * Renderer for the shadcn toast store.
 *
 * This was missing. `toast()` in use-toast.ts dispatches into an in-memory
 * store that only becomes visible if something subscribes to it and renders
 * the result -- and nothing did, so all 55 `toast({...})` calls across the
 * De-Duplicator, Bulk Duplicate Finder, Rate & Cull and GPS Manager silently
 * displayed nothing, error messages included. RootLayout only ever mounted
 * react-hot-toast's Toaster, which is a separate library serving the other
 * half of the app (see the "two toast systems" note in BACKLOG.md).
 *
 * Mounting this makes those existing calls behave the way their authors wrote
 * them; it does not change any of them.
 */
export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
