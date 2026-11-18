import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Avatar, Button, Card, PageHeader, inputClass, textareaClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import type { PositionDraft } from '../types'
import { money, navigate, uid } from '../utils'

interface FormState {
  title: string
  eventName: string
  productName: string
  price: string
  deadline: string
  description: string
  rules: string
}

type FormErrors = Partial<Record<keyof FormState | 'positions', string>>

const initialForm: FormState = {
  title: '',
  eventName: '',
  productName: '',
  price: '',
  deadline: '',
  description: '',
  rules: '每个位置对应 1 件商品；截单前如需调整，请先与车主沟通；本页面为模拟演示，不产生真实交易。',
}

export function CreatePage() {
  const { currentUser, createCarpool, permissions } = useAppStore()
  const showToast = useToast()
  const perm = permissions
  const [form, setForm] = useState<FormState>(initialForm)
  const [positions, setPositions] = useState<PositionDraft[]>([
    { id: uid('draft'), label: '', quantity: 1 },
  ])
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const totalPositions = positions.reduce((sum, item) => sum + (item.label.trim() ? item.quantity : 0), 0)
  const previewPrice = Number(form.price) || 0
  const canPreview = form.title.trim() || form.productName.trim()

  const minDeadline = useMemo(() => {
    const date = new Date(Date.now() + 60 * 60 * 1000)
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }, [])

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const updatePosition = (id: string, changes: Partial<PositionDraft>) => {
    setPositions((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
    if (errors.positions) setErrors((current) => ({ ...current, positions: undefined }))
  }

  const validate = () => {
    const next: FormErrors = {}
    if (form.title.trim().length < 4) next.title = '请填写至少 4 个字的拼车标题。'
    if (!form.eventName.trim()) next.eventName = '请填写活动名称。'
    if (!form.productName.trim()) next.productName = '请填写商品名称。'
    const price = Number(form.price)
    if (!Number.isFinite(price) || price <= 0) next.price = '请输入大于 0 的商品价格。'
    if (!form.deadline) next.deadline = '请选择截单时间。'
    else if (new Date(form.deadline).getTime() <= Date.now()) next.deadline = '截单时间需要晚于当前时间。'
    if (form.description.trim().length < 10) next.description = '请至少用 10 个字说明拼车安排。'
    if (form.rules.trim().length < 10) next.rules = '请至少用 10 个字说明拼车规则。'
    const validPositions = positions.filter((item) => item.label.trim())
    if (!validPositions.length) next.positions = '请至少填写一个开放位置。'
    else if (new Set(validPositions.map((item) => item.label.trim().toLowerCase())).size !== validPositions.length) next.positions = '位置名称不能重复，可以通过数量一次开放多个。'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!perm.canCreate) {
      showToast(perm.reason, 'error')
      return
    }
    if (!validate()) {
      showToast('还有信息没有填写完整，请检查标记项。', 'error')
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      const result = createCarpool({
        title: form.title.trim(),
        eventName: form.eventName.trim(),
        productName: form.productName.trim(),
        price: Number(form.price),
        deadline: form.deadline,
        description: form.description.trim(),
        rules: form.rules.trim(),
        positionGroups: positions.filter((item) => item.label.trim()).map((item) => ({ label: item.label.trim(), quantity: item.quantity })),
      })
      setSubmitting(false)
      if (!result.ok || !result.data) {
        showToast(result.message, 'error')
        return
      }
      showToast('拼车已发布，现在可以在广场找到它。', 'success')
      navigate(`/detail/${result.data.id}`)
    }, 500)
  }

  return (
    <>
      <PageHeader eyebrow="Create a Carpool" title="发起一辆拼车" description="把活动、商品和位置说明清楚，发布后会立即出现在拼车广场。" />

      {!perm.canCreate && (
        <Card className="mb-5 border-danger/20 bg-dangerSoft p-5">
          <p className="text-sm font-bold text-danger">暂时无法发起拼车</p>
          <p className="mt-1 text-sm leading-6 text-danger/85">{perm.reason}</p>
          <p className="mt-1 text-xs leading-5 text-danger/70">{perm.hint}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate('/reputation')}>查看我的信誉</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/complaints?tab=appeals')}>提交申诉</Button>
          </div>
        </Card>
      )}

      <form onSubmit={submit} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-purple-50 text-sm font-black text-primary">01</span>
              <div>
                <h2 className="font-bold text-ink">基础信息</h2>
                <p className="mt-0.5 text-xs text-muted">车员在广场上最先看到的内容</p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="拼车标题" required error={errors.title} className="sm:col-span-2">
                <input className={inputClass} value={form.title} onChange={(event) => updateField('title', event.target.value)} placeholder="例如：快闪店亚克力牌拼车" maxLength={40} />
              </Field>
              <Field label="活动名称" required error={errors.eventName}>
                <input className={inputClass} value={form.eventName} onChange={(event) => updateField('eventName', event.target.value)} placeholder="活动或系列名称" maxLength={50} />
              </Field>
              <Field label="商品名称" required error={errors.productName}>
                <input className={inputClass} value={form.productName} onChange={(event) => updateField('productName', event.target.value)} placeholder="具体周边商品" maxLength={40} />
              </Field>
              <Field label="单个位置价格" required error={errors.price} hint="仅用于模拟支付">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">¥</span>
                  <input className={`${inputClass} pl-8`} value={form.price} onChange={(event) => updateField('price', event.target.value)} type="number" min="0.01" step="0.01" placeholder="0.00" />
                </div>
              </Field>
              <Field label="截单时间" required error={errors.deadline}>
                <input className={inputClass} value={form.deadline} onChange={(event) => updateField('deadline', event.target.value)} type="datetime-local" min={minDeadline} />
              </Field>
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-purple-50 text-sm font-black text-primary">02</span>
              <div>
                <h2 className="font-bold text-ink">开放位置</h2>
                <p className="mt-0.5 text-xs text-muted">按成员或商品款式设置可选位置</p>
              </div>
            </div>
            <div className="space-y-3">
              {positions.map((position, index) => (
                <div key={position.id} className="grid grid-cols-[minmax(0,1fr)_92px_40px] gap-2">
                  <label>
                    <span className="sr-only">位置 {index + 1} 名称</span>
                    <input className={inputClass} value={position.label} onChange={(event) => updatePosition(position.id, { label: event.target.value })} placeholder={`位置 ${index + 1}，如 MARK`} maxLength={24} />
                  </label>
                  <label>
                    <span className="sr-only">位置 {index + 1} 数量</span>
                    <input className={inputClass} value={position.quantity} onChange={(event) => updatePosition(position.id, { quantity: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} type="number" min="1" max="20" title="数量" />
                  </label>
                  <button
                    type="button"
                    className="grid min-h-11 place-items-center rounded-xl text-lg text-slate-400 transition hover:bg-dangerSoft hover:text-danger focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20 disabled:cursor-not-allowed disabled:opacity-30"
                    onClick={() => setPositions((current) => current.filter((item) => item.id !== position.id))}
                    disabled={positions.length === 1}
                    aria-label={`删除位置 ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {errors.positions && <p className="mt-3 text-xs font-medium text-danger" role="alert">{errors.positions}</p>}
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => setPositions((current) => [...current, { id: uid('draft'), label: '', quantity: 1 }])} disabled={positions.length >= 12}>
                ＋ 添加位置
              </Button>
              <span className="text-xs text-muted">共 {totalPositions} 个位置</span>
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-purple-50 text-sm font-black text-primary">03</span>
              <div>
                <h2 className="font-bold text-ink">说明与规则</h2>
                <p className="mt-0.5 text-xs text-muted">减少误解，让车员上车前了解安排</p>
              </div>
            </div>
            <div className="space-y-5">
              <Field label="拼车说明" required error={errors.description}>
                <textarea className={textareaClass} value={form.description} onChange={(event) => updateField('description', event.target.value)} placeholder="说明下单、到货和发货安排" maxLength={300} />
              </Field>
              <Field label="拼车规则" required error={errors.rules}>
                <textarea className={textareaClass} value={form.rules} onChange={(event) => updateField('rules', event.target.value)} maxLength={300} />
              </Field>
            </div>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted">发布预览</p>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2.5">
                <Avatar user={currentUser} size="sm" />
                <div>
                  <p className="text-xs font-bold text-ink">{currentUser.nickname}</p>
                  <p className="text-[11px] text-muted">将作为本车车主</p>
                </div>
              </div>
              <div className="mt-5 min-h-28">
                <p className="text-xs font-semibold text-primary">{form.eventName || '活动名称'}</p>
                <h3 className={`mt-2 text-lg font-bold leading-7 ${canPreview ? 'text-ink' : 'text-slate-300'}`}>{form.title || '你的拼车标题会显示在这里'}</h3>
                <p className="mt-2 text-sm text-muted">{form.productName || '商品名称'}</p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
                <div>
                  <p className="text-[11px] text-muted">单价</p>
                  <p className="mt-1 font-black text-ink">{money(previewPrice)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">开放位置</p>
                  <p className="mt-1 font-black text-ink">{totalPositions} 个</p>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 p-5">
              <Button type="submit" size="lg" loading={submitting} className="w-full" disabled={!perm.canCreate}>确认发布</Button>
              <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => navigate('/')}>返回广场</Button>
              <p className="mt-3 text-center text-[11px] leading-5 text-muted">发布后仍可通过车主管理查看车员与进度</p>
            </div>
          </Card>
        </aside>
      </form>
    </>
  )
}

function Field({ label, required, error, hint, className, children }: { label: string; required?: boolean; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-ink">
        <span>{label}{required && <span className="ml-1 text-danger">*</span>}</span>
        {hint && <span className="text-[11px] font-normal text-muted">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-2 block text-xs font-medium text-danger" role="alert">{error}</span>}
    </label>
  )
}
