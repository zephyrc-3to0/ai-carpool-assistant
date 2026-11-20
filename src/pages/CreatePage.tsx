import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Avatar, Button, Card, EmptyState, PageHeader, inputClass, textareaClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import type { PurchaseGuarantees, PurchaseMode } from '../types'
import { formatFullDateTime, money, navigate } from '../utils'
import { eventOf, groupOf, latestCutDeadline, memberPriceOf, productsOf } from '../lib/catalog'
import { guaranteeText, purchaseModeDescription, purchaseModeText } from '../lib/share'
import { MIN_RESERVE_HOURS, PACKAGE_ITEMS_RANGE } from '../config'
import { getRoute } from '../utils'
import type { OpenItemInput } from '../lib/shareOps'

interface FormState {
  title: string
  description: string
  rules: string
  fallbackRule: string
}

const initialForm: FormState = {
  title: '',
  description: '',
  rules: '每个份额对应 1 件商品；截团前如需调整，请先与车主沟通；本页面为模拟演示，不产生真实交易。',
  fallbackRule: '未凑齐时车主会按已确认规则处理；不会未经车员同意分摊额外费用。',
}

/**
 * V2.0 发布拼车页面（单页六个业务分区）。
 * 团体与活动由当前活动页面传入，不允许换成与上下文不一致的对象。
 */
export function CreatePage() {
  const { currentUser, createCarpool, permissions, saveDraft } = useAppStore()
  const showToast = useToast()
  const { searchParams } = getRoute()
  const groupId = searchParams.get('group') ?? ''
  const eventId = searchParams.get('event') ?? ''
  const draftId = searchParams.get('draft') ?? ''

  const { data } = useAppStore()
  const group = groupOf(data, groupId)
  const event = eventOf(data, eventId)
  const products = productsOf(data, eventId)
  const draft = (data.drafts ?? []).find((item) => (
    item.id === draftId
    && item.ownerId === currentUser.id
    && item.groupId === groupId
    && item.eventId === eventId
  ))

  const [form, setForm] = useState<FormState>(initialForm)
  const [mode, setMode] = useState<PurchaseMode>('bundle')
  /** 开放份额：bundle 模式按「商品 × 成员位置」，single 模式按商品 */
  const [openItems, setOpenItems] = useState<OpenItemInput[]>([])
  /** 车主优先自购 */
  const [ownerHeld, setOwnerHeld] = useState<Array<{ productId: string; member?: string; quantity: number }>>([])
  const [guarantees, setGuarantees] = useState<PurchaseGuarantees>({ fullSetOrdered: true, memberDesign: true })
  const [internationalFreight, setInternationalFreight] = useState('0')
  const [minAmount, setMinAmount] = useState('600')
  const [maxPackageItems, setMaxPackageItems] = useState('20')
  const [deadline, setDeadline] = useState('')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [submitting, setSubmitting] = useState(false)

  const latestCut = latestCutDeadline(event)

  useEffect(() => {
    if (!latestCut) return
    const suggested = new Date(new Date(latestCut).getTime() - 3600 * 1000)
    setDeadline((current) => current || suggested.toISOString().slice(0, 16))
  }, [latestCut])

  useEffect(() => {
    if (!draft) return
    const restoredItems: OpenItemInput[] = draft.data.productGroups.flatMap((item) => {
      const product = products.find((entry) => entry.id === item.productId)
      if (!product) return []
      return [{
        productId: item.productId,
        member: item.member,
        quantity: item.quantity,
        price: item.price,
        name: product.name,
        spec: product.spec,
        category: product.category,
      }]
    })
    setForm({
      title: draft.title === '未命名草稿' ? '' : draft.title,
      description: draft.data.description,
      rules: draft.data.rules,
      fallbackRule: draft.data.fallbackRule,
    })
    setMode(draft.data.purchaseMode)
    setOpenItems(restoredItems)
    setOwnerHeld(draft.data.ownerHeld)
    setGuarantees(draft.data.guarantees)
    setInternationalFreight(String(draft.data.internationalFreight))
    setMinAmount(String(draft.data.minAmount))
    setMaxPackageItems(String(draft.data.maxPackageItems))
    setDeadline(draft.data.deadline ? draft.data.deadline.slice(0, 16) : '')
  }, [draft?.id])

  const changeMode = (nextMode: PurchaseMode) => {
    setMode(nextMode)
    setOpenItems([])
    setOwnerHeld([])
    setGuarantees({ fullSetOrdered: nextMode === 'bundle', memberDesign: nextMode === 'bundle' })
    setForm((current) => ({
      ...current,
      fallbackRule: nextMode === 'bundle'
        ? '开放成员位置未全部凑齐时，车主会按发布规则处理；不会未经车员同意分摊额外费用。'
        : '未达最低成团金额时按未成团规则处理；车主可以在允许期限内延期，不会未经车员同意分摊额外费用。',
    }))
    setErrors({})
  }

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const openKey = (productId: string, member?: string) => `${productId}::${member ?? ''}`

  const setOpenQuantity = (productId: string, member: string | undefined, quantity: number) => {
    setOpenItems((current) => {
      const key = openKey(productId, member)
      const index = current.findIndex((item) => openKey(item.productId, item.member) === key)
      const product = products.find((item) => item.id === productId)
      if (!product) return current
      const price = memberPriceOf(product, member)
      const nextItem: OpenItemInput = {
        productId,
        member,
        quantity: Math.max(0, Math.min(50, quantity)),
        price,
        name: product.name,
        spec: product.spec,
        category: product.category,
      }
      if (index < 0) return nextItem.quantity > 0 ? [...current, nextItem] : current
      const copy = [...current]
      copy[index] = nextItem
      return nextItem.quantity > 0 ? copy : copy.filter((item) => openKey(item.productId, item.member) !== key)
    })
    setErrors((current) => ({ ...current, items: undefined }))
  }

  const openQuantityOf = (productId: string, member?: string) => {
    const key = openKey(productId, member)
    return openItems.find((item) => openKey(item.productId, item.member) === key)?.quantity ?? 0
  }

  const setHeldQuantity = (productId: string, member: string | undefined, quantity: number) => {
    const key = openKey(productId, member)
    const product = products.find((item) => item.id === productId)
    const opened = openQuantityOf(productId, member)
    const packageCapacity = Math.max(PACKAGE_ITEMS_RANGE.min, Math.min(PACKAGE_ITEMS_RANGE.max, Number(maxPackageItems) || 1))
    const maximum = mode === 'single'
      ? Math.min(packageCapacity, product?.perUserLimit ?? packageCapacity)
      : opened
    setOwnerHeld((current) => {
      const index = current.findIndex((item) => openKey(item.productId, item.member) === key)
      const copy = index >= 0 ? [...current] : [...current, { productId, member, quantity: 0 }]
      const normalized = Math.max(0, Math.min(maximum, Math.floor(quantity)))
      if (index >= 0) copy[index] = { ...copy[index], quantity: normalized }
      return copy.filter((item) => item.quantity > 0)
    })
  }

  const heldQuantityOf = (productId: string, member?: string) => {
    const key = openKey(productId, member)
    return ownerHeld.find((item) => openKey(item.productId, item.member) === key)?.quantity ?? 0
  }

  const freightNumber = Number(internationalFreight) || 0
  const minAmountNumber = Number(minAmount) || 0
  const packageItems = Math.max(PACKAGE_ITEMS_RANGE.min, Math.min(PACKAGE_ITEMS_RANGE.max, Number(maxPackageItems) || 1))
  const selectedProductCount = openItems.filter((item) => item.quantity > 0).length
  const totalShares = mode === 'single'
    ? (selectedProductCount > 0 ? packageItems : 0)
    : openItems.reduce((sum, item) => sum + item.quantity, 0)
  const heldTotal = ownerHeld.reduce((sum, item) => sum + item.quantity, 0)
  const estimatedGoods = openItems.reduce((sum, item) => sum + item.quantity * item.price, 0)

  const validate = () => {
    const next: Record<string, string | undefined> = {}
    if (form.title.trim().length < 4) next.title = '请填写至少 4 个字的拼车标题。'
    if (form.description.trim().length < 10) next.description = '请至少用 10 个字说明拼车安排。'
    if (form.rules.trim().length < 10) next.rules = '请至少用 10 个字说明拼车规则。'
    if (form.fallbackRule.trim().length < 10) next.fallbackRule = '请至少用 10 个字说明未凑齐时如何处理。'
    if (!totalShares) next.items = '请至少开放一个商品或成员位置。'
    if (!deadline) next.deadline = '请选择招募截止时间。'
    else if (latestCut && new Date(deadline).getTime() > new Date(latestCut).getTime()) {
      next.deadline = `不能晚于平台最晚允许截团时间（${formatFullDateTime(latestCut)}）。`
    }
    if (freightNumber < 0) next.freight = '国际运费不能为负数。'
    if (mode === 'single') {
      if (minAmountNumber <= 0) next.minAmount = '最低成团金额需要大于 0。'
      if (packageItems < PACKAGE_ITEMS_RANGE.min) next.packageItems = '包裹最大件数至少为 1。'
      if (heldTotal > packageItems) next.items = '车主自购总件数不能超过整车包裹上限。'
    }
    const invalidHeld = ownerHeld.find((held) => {
      const product = products.find((item) => item.id === held.productId)
      const opened = mode === 'single' ? packageItems : openQuantityOf(held.productId, held.member)
      return held.quantity > opened || held.quantity > (product?.perUserLimit ?? opened)
    })
    if (invalidHeld) next.items = '车主自购数量超过开放份数或活动限购，请调整后重试。'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const buildInput = () => {
    const singleItems = mode === 'single'
      ? openItems.map((item) => ({ ...item, quantity: packageItems }))
      : openItems
    return {
      sourceDraftId: draft?.id,
      title: form.title.trim(),
      groupId,
      eventId,
      description: form.description.trim(),
      rules: form.rules.trim(),
      purchaseMode: mode,
      openItems: singleItems,
      guarantees: mode === 'bundle' ? { ...guarantees, fullSetOrdered: true } : guarantees,
      fallbackRule: form.fallbackRule.trim(),
      deadline: new Date(deadline).toISOString(),
      internationalFreight: freightNumber,
      minAmount: mode === 'single' ? minAmountNumber : 0,
      maxPackageItems: mode === 'single' ? packageItems : 0,
      ownerHeld,
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!permissions.canCreate) {
      showToast(permissions.reason, 'error')
      return
    }
    if (!validate()) {
      showToast('还有信息没有填写完整，请检查标记项。', 'error')
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      const result = createCarpool(buildInput())
      setSubmitting(false)
      if (!result.ok || !result.data) {
        showToast(result.message, 'error')
        return
      }
      showToast('拼车已发布，已出现在对应活动广场。', 'success')
      navigate(`/detail/${result.data.id}`)
    }, 500)
  }

  const saveDraftAction = () => {
    const result = saveDraft({
      id: draft?.id,
      groupId,
      eventId,
      title: form.title || '未命名草稿',
      data: {
        description: form.description,
        rules: form.rules,
        purchaseMode: mode,
        productGroups: openItems.map((item) => ({ productId: item.productId, member: item.member, quantity: item.quantity, price: item.price })),
        guarantees,
        fallbackRule: form.fallbackRule,
        deadline,
        internationalFreight: freightNumber,
        minAmount: minAmountNumber,
        maxPackageItems: packageItems,
        ownerHeld,
      },
    })
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  if (!group || !event) {
    return (
      <EmptyState
        title="请先选择一个活动"
        description="发布拼车需要从具体活动页面进入，以确保团体与活动信息正确。"
        action={<Button onClick={() => navigate('/')}>返回拼车广场</Button>}
      />
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Create a Carpool"
        title="发起一辆拼车"
        description={`在「${group.name} · ${event.name}」下发布拼车，发布后会立即出现在该活动的拼车广场。`}
      />

      {!permissions.canCreate && (
        <Card className="mb-5 border-danger/20 bg-dangerSoft p-5">
          <p className="text-sm font-bold text-danger">暂时无法发起拼车</p>
          <p className="mt-1 text-sm leading-6 text-danger/85">{permissions.reason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate('/reputation')}>查看我的信誉</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/complaints?tab=appeals')}>提交申诉</Button>
          </div>
        </Card>
      )}

      <form onSubmit={submit} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* 01 基本信息 */}
          <Card className="p-5 sm:p-7">
            <SectionTitle index="01" title="基本信息" hint="团体与活动来自当前活动页面，不可更换" />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="已选团体">
                <div className="flex min-h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5">
                  <span className="grid h-6 w-6 place-items-center rounded-lg text-[10px] font-black text-white" style={{ backgroundColor: group.color }} aria-hidden="true">
                    {group.shortName.slice(0, 2)}
                  </span>
                  <span className="text-sm font-semibold text-ink">{group.name}</span>
                </div>
              </Field>
              <Field label="已选活动">
                <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5">
                  <span className="text-sm font-semibold text-ink">{event.name}</span>
                </div>
              </Field>
              <Field label="拼车标题" required error={errors.title} className="sm:col-span-2">
                <input className={inputClass} value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="例如：A 版立牌整套凑套" maxLength={40} />
              </Field>
              <Field label="拼车说明" required error={errors.description} className="sm:col-span-2">
                <textarea className={textareaClass} value={form.description} onChange={(e) => updateField('description', e.target.value)} placeholder="说明下单、到货和发货安排" maxLength={300} />
              </Field>
              <Field label="拼车模式" className="sm:col-span-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['bundle', 'single'] as PurchaseMode[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => changeMode(item)}
                      aria-pressed={mode === item}
                      className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 ${
                        mode === item ? 'border-primary bg-purple-50 shadow-button' : 'border-slate-200 bg-white hover:border-purple-300'
                      }`}
                    >
                      <span className={`block text-sm font-bold ${mode === item ? 'text-primaryDark' : 'text-ink'}`}>{purchaseModeText[item]}</span>
                      <span className="mt-2 block text-xs leading-5 text-muted">{purchaseModeDescription[item]}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Card>

          {/* 02 商品与开放数量 */}
          <Card className="p-5 sm:p-7">
            <SectionTitle index="02" title="商品与开放数量" hint="商品来自活动商品目录" />
            {errors.items && <p className="mb-4 text-xs font-medium text-danger" role="alert">{errors.items}</p>}
            <div className="space-y-4">
              {products.map((product) => (
                <div key={product.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink">{product.name} · {product.spec}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {product.category} · {money(product.price)} · 每人限购 {product.perUserLimit} 件
                      </p>
                    </div>
                  </div>

                  {mode === 'bundle' ? (
                    <div className="mt-3 space-y-2">
                      {product.members.map((member) => (
                        <div key={member} className="flex items-center gap-3">
                          <span className="min-w-24 flex-none text-xs font-semibold text-ink">{member}</span>
                          <span className="min-w-16 flex-none text-[11px] text-muted">{money(memberPriceOf(product, member))}</span>
                          <input
                            className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100"
                            value={openQuantityOf(product.id, member)}
                            onChange={(e) => setOpenQuantity(product.id, member, Number(e.target.value) || 0)}
                            type="number"
                            min="0"
                            max="50"
                            title={`开放 ${member} 的份数`}
                          />
                          <span className="text-[11px] text-muted">份</span>
                          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-purple-200"
                              checked={heldQuantityOf(product.id, member) > 0}
                              onChange={(e) => setHeldQuantity(product.id, member, e.target.checked ? 1 : 0)}
                            />
                            车主自留
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-purple-200"
                          checked={openQuantityOf(product.id) > 0}
                          onChange={(e) => setOpenQuantity(product.id, undefined, e.target.checked ? 1 : 0)}
                        />
                        开放这个商品
                      </label>
                      <span className="text-[11px] text-muted">普通拼邮的件数上限由整车包裹容量决定</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {mode === 'single' && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label="最低成团金额" required error={errors.minAmount} hint="达到后可手动截团">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">¥</span>
                    <input className={`${inputClass} pl-8`} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} type="number" min="1" step="1" />
                  </div>
                </Field>
                <Field label="整车国际包裹最大商品件数" required error={errors.packageItems} hint={`${PACKAGE_ITEMS_RANGE.min}–${PACKAGE_ITEMS_RANGE.max} 件`}>
                  <input className={inputClass} value={maxPackageItems} onChange={(e) => setMaxPackageItems(e.target.value)} type="number" min={PACKAGE_ITEMS_RANGE.min} max={PACKAGE_ITEMS_RANGE.max} />
                </Field>
              </div>
            )}
          </Card>

          {/* 03 车主优先自购 */}
          <Card className="p-5 sm:p-7">
            <SectionTitle index="03" title="车主优先自购" hint="不需要模拟付款，确认后直接占位" />
            <p className="text-sm leading-6 text-muted">
              自购份额会计入招募进度、采购清单与国际运费分摊，并单独保存为「车主自购记录」，不会伪造车主向自己付款的交易。
            </p>
            <div className="mt-4 space-y-2">
              {openItems.filter((item) => item.quantity > 0).map((item) => (
                <div key={openKey(item.productId, item.member)} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                    {item.name} {item.spec}{item.member ? ` · ${item.member}` : ''}
                  </span>
                  <span className="text-[11px] text-muted">
                    {mode === 'single'
                      ? `单品最多自购 ${Math.min(packageItems, products.find((product) => product.id === item.productId)?.perUserLimit ?? packageItems)} 件`
                      : `已开放 ${item.quantity} 份`}
                  </span>
                  <input
                    className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100"
                    value={heldQuantityOf(item.productId, item.member)}
                    onChange={(e) => setHeldQuantity(item.productId, item.member, Number(e.target.value) || 0)}
                    type="number"
                    min="0"
                    max={mode === 'single'
                      ? Math.min(packageItems, products.find((product) => product.id === item.productId)?.perUserLimit ?? packageItems)
                      : item.quantity}
                    title="车主自购份数"
                  />
                  <span className="text-[11px] text-muted">份自购</span>
                </div>
              ))}
              {!openItems.some((item) => item.quantity > 0) && (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-muted">先在上一步开放商品后，才能选择自购份额。</p>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">发布后、截团前，车主仍然可以追加自购剩余份额；已被车员付款占用的份额不会被覆盖。</p>
          </Card>

          {/* 04 费用设置 */}
          <Card className="p-5 sm:p-7">
            <SectionTitle index="04" title="费用设置" hint="国际运费在发车时一次确定" />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="整车国际运费总额" required error={errors.freight}>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">¥</span>
                  <input className={`${inputClass} pl-8`} value={internationalFreight} onChange={(e) => setInternationalFreight(e.target.value)} type="number" min="0" step="0.01" />
                </div>
              </Field>
              <Field label="未凑齐处理规则" required error={errors.fallbackRule}>
                <textarea className={textareaClass} value={form.fallbackRule} onChange={(e) => updateField('fallbackRule', e.target.value)} maxLength={300} />
              </Field>
            </div>

            <div className="mt-5 rounded-2xl bg-purple-50 p-4">
              <p className="text-xs font-bold text-primaryDark">国际运费 AA 分摊规则</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-primaryDark/85">
                <li>· {mode === 'bundle' ? '整套凑套：按成员位置份数均摊' : '普通拼邮：按商品件数均摊'}</li>
                <li>· 每份商品或成员位置的国际运费权重相同</li>
                <li>· 车主自购部分同样参与分摊</li>
                <li>· 截团时按最终有效数量自动计算并生成账单，不需要车主再次录入</li>
                <li>· 国内打包费与国内运费在到货后的发货阶段另行结算</li>
              </ul>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-bold text-ink">款式保障（两个开关互相独立）</p>
              <div className="space-y-2">
                <GuaranteeToggle
                  checked={mode === 'bundle' ? true : guarantees.fullSetOrdered}
                  disabled={mode === 'bundle'}
                  onChange={(value) => setGuarantees((current) => ({ ...current, fullSetOrdered: value }))}
                  label={guaranteeText.fullSetOrdered.label}
                  description={mode === 'bundle' ? '整套凑套模式固定开启：实际采购时按完整套数购买。' : guaranteeText.fullSetOrdered.description}
                />
                <GuaranteeToggle
                  checked={guarantees.memberDesign}
                  onChange={(value) => setGuarantees((current) => ({ ...current, memberDesign: value }))}
                  label={guaranteeText.memberDesign.label}
                  description={guaranteeText.memberDesign.description}
                />
              </div>
            </div>
          </Card>

          {/* 05 招募时间 */}
          <Card className="p-5 sm:p-7">
            <SectionTitle index="05" title="招募时间" hint="平台统一保留最低采购预留时间" />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="官方下单截止时间">
                <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-ink">
                  {formatFullDateTime(event.orderDeadline)}
                </div>
              </Field>
              <Field label="平台最晚允许截团时间">
                <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-ink">
                  {latestCut ? formatFullDateTime(latestCut) : '—'}
                </div>
              </Field>
              <Field label="招募截止时间" required error={errors.deadline} className="sm:col-span-2" hint={`官方截止 − ${MIN_RESERVE_HOURS} 小时预留`}>
                <input className={inputClass} value={deadline} onChange={(e) => { setDeadline(e.target.value); setErrors((c) => ({ ...c, deadline: undefined })) }} type="datetime-local" />
              </Field>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              最低采购预留时间为 {MIN_RESERVE_HOURS} 小时（统一配置项）。招募截止时间不得超过平台最晚允许截团时间。
            </p>
          </Card>

          {/* 06 规则与预览 */}
          <Card className="p-5 sm:p-7">
            <SectionTitle index="06" title="拼车规则与发布" hint="草稿统一在车主管理中查看" />
            <Field label="拼车规则" required error={errors.rules}>
              <textarea className={textareaClass} value={form.rules} onChange={(e) => updateField('rules', e.target.value)} maxLength={300} />
            </Field>
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
              <div className="mt-5">
                <p className="text-xs font-bold text-primary">{group.name} · {event.name}</p>
                <h3 className={`mt-2 text-lg font-bold leading-7 ${form.title ? 'text-ink' : 'text-slate-300'}`}>{form.title || '你的拼车标题会显示在这里'}</h3>
              </div>
              <div className="mt-4 rounded-xl bg-purple-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{purchaseModeText[mode]}</p>
                <p className="mt-1.5 text-xs leading-5 text-primaryDark">
                  {mode === 'bundle'
                    ? '全部成员位置被有效占用后自动截团'
                    : `最低成团 ${money(minAmountNumber)}，包裹上限 ${packageItems} 件`}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
                <div>
                  <p className="text-[11px] text-muted">{mode === 'single' ? '开放商品' : '开放份额'}</p>
                  <p className="mt-1 font-black text-ink">{mode === 'single' ? `${selectedProductCount} 种` : `${totalShares} 份`}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">车主自购</p>
                  <p className="mt-1 font-black text-ink">{heldTotal} 份</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">{mode === 'single' ? '最低成团金额' : '商品款预估'}</p>
                  <p className="mt-1 font-black text-ink">{money(mode === 'single' ? minAmountNumber : estimatedGoods)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">整车国际运费</p>
                  <p className="mt-1 font-black text-ink">{money(freightNumber)}</p>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 p-5">
              <Button type="submit" size="lg" loading={submitting} className="w-full" disabled={!permissions.canCreate}>正式发布</Button>
              <Button type="button" variant="secondary" className="mt-2 w-full" onClick={saveDraftAction}>保存草稿</Button>
              <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => navigate(`/event/${group.id}/${event.id}`)}>返回活动广场</Button>
              <p className="mt-3 text-center text-[11px] leading-5 text-muted">发布后立即出现在「{event.name}」的拼车广场</p>
            </div>
          </Card>
        </aside>
      </form>
    </>
  )
}

function SectionTitle({ index, title, hint }: { index: string; title: string; hint?: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-purple-50 text-sm font-black text-primary">{index}</span>
      <div>
        <h2 className="font-bold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  )
}

function GuaranteeToggle({
  checked,
  disabled,
  onChange,
  label,
  description,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 ${
        disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50' : checked ? 'border-primary bg-purple-50' : 'border-slate-200 bg-white hover:border-purple-300'
      }`}
    >
      <span className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border-2 text-[10px] ${checked ? 'border-primary bg-primary text-white' : 'border-slate-300'}`} aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-bold ${checked ? 'text-primaryDark' : 'text-ink'}`}>{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </button>
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
