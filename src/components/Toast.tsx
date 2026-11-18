import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { uid } from '../utils'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = uid('toast')
    setItems((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, 3200)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-20 z-[100] flex flex-col items-center gap-2" aria-live="polite" aria-atomic="true">
        {items.map((item) => (
          <div
            key={item.id}
            className={`toast pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-float ${
              item.tone === 'success'
                ? 'border-success/20 bg-successSoft text-success'
                : item.tone === 'error'
                  ? 'border-danger/20 bg-dangerSoft text-danger'
                  : 'border-purple-200 bg-white text-ink'
            }`}
            role={item.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full border border-current text-[11px]">
              {item.tone === 'success' ? '✓' : item.tone === 'error' ? '!' : 'i'}
            </span>
            <span className="leading-5">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}
