import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import type { CarpoolStatus, User } from '../types'
import { statusText } from '../utils'

export function cn(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ')
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'button-base inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-primary text-white shadow-button hover:bg-primaryDark active:translate-y-px',
        variant === 'secondary' && 'border border-purple-200 bg-purple-50 text-primaryDark hover:border-purple-300 hover:bg-purple-100 active:translate-y-px',
        variant === 'ghost' && 'text-muted hover:bg-slate-100 hover:text-ink active:translate-y-px',
        variant === 'danger' && 'border border-danger/20 bg-dangerSoft text-danger hover:bg-danger/10 active:translate-y-px',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-sm',
        size === 'lg' && 'min-h-12 px-5 text-[15px]',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Avatar({ user, size = 'md' }: { user: User; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full font-bold text-white shadow-sm',
        size === 'sm' && 'h-7 w-7 text-xs',
        size === 'md' && 'h-9 w-9 text-sm',
        size === 'lg' && 'h-12 w-12 text-base',
      )}
      style={{ backgroundColor: user.color }}
      aria-label={user.nickname}
      title={user.nickname}
    >
      {user.initial}
    </span>
  )
}

export function StatusBadge({ status }: { status: CarpoolStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
      status === 'recruiting' && 'border-success/20 bg-successSoft text-success',
      status === 'formed' && 'border-primary/20 bg-purple-50 text-primaryDark',
      status === 'closed' && 'border-slate-200 bg-slate-100 text-muted',
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {statusText[status]}
    </span>
  )
}

export function ProgressBar({ used, total }: { used: number; total: number }) {
  const percent = total ? Math.min(100, Math.round((used / total) * 100)) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>拼车进度</span>
        <span className="font-semibold text-ink">{used}/{total} 个位置</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={used}>
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
        <h1 className="text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-xl text-pretty text-[15px] leading-7 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-card border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-200 bg-purple-50 text-lg font-semibold text-primary" aria-hidden="true">○</span>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-pretty text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function InfoRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-6 border-b border-slate-100 py-3.5 last:border-0', className)}>
      <span className="flex-none text-sm text-muted">{label}</span>
      <div className="text-right text-sm font-medium leading-6 text-ink">{children}</div>
    </div>
  )
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-slate-200/80 bg-white shadow-card', className)} {...props}>{children}</div>
}

export const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:ring-4 focus:ring-purple-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted'
export const textareaClass = `${inputClass} min-h-28 resize-y py-3 leading-6`
