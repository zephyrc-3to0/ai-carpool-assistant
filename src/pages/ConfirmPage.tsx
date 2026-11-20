import { useMemo, useState } from 'react'
import { Avatar, Button, Card, EmptyState, InfoRow } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { formatFullDateTime, money, navigate } from '../utils'
import { eventOf, groupOf, productsOf } from '../lib/catalog'
import { guaranteeText, purchaseModeOf, purchaseModeText } from '../lib/share'
import { formatCents } from '../lib/money'

type DemoResult = 'success' | 'failure' | 'timeout'

/**
 * V2.0 购买确认页。
 * 展示商品名称规格、成员位置、数量、商品款合计、国际运费 AA 提示与交易规则，
 * 并在此处完成模拟付款；付款成功后才正式占位并生成有效订单。
 * 首次购买只支付商品款，不在这里要求填写国内收货地址。
 */
export function ConfirmPage({ carpoolId, slotIds }: { carpoolId: string; slotIds: string[] }) {
  const { data, currentUser, reserveShares, confirmPayment, permissions } = useAppStore()
  const showToast = useToast()
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [demoResult, setDemoResult] = useState<DemoResult>('success')
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const perm = permissions

  const mode = purchaseModeOf(carpool)
  const slots = useMemo(
    () => carpool ? carpool.positions.filter((slot) => slotIds.includes(slot.id)) : [],
    [carpool, slotIds],
  )

  if (!carpool) {
    return <EmptyState title="车次信息不存在" description="没有找到对应的拼车，请返回活动广场重新选择。" action={<Button onClick={() => navigate('/')}>返回拼车广场</Button>} />
  }

  const owner = data.users.find((user) => user.id === carpool.ownerId)
  const event = eventOf(data, carpool.eventId)
  const group = groupOf(data, carpool.groupId)
  const isOwner = carpool.ownerId === currentUser.id
  const quantity = slots.length
  const goodsTotal = slots.reduce((sum, slot) => sum + (slot.price ?? carpool.price ?? 0), 0)

  if (isOwner) {
    return (
      <EmptyState
        title="车主自购不需要模拟付款"
        description="请返回车次详情，在对应商品分组中使用“确认自购”。确认后份额会直接占位，并保存独立的车主自购记录。"
        action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>返回车次详情</Button>}
      />
    )
  }

  if (slots.length !== slotIds.length) {
    return <EmptyState title="所选份额已不可用" description="份额可能已被其他账号占用，请返回详情页重新选择。" action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>返回车次详情</Button>} />
  }

  if (!perm.canJoin) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <Card className="border-danger/20 bg-dangerSoft p-6 text-center">
          <h1 className="text-xl font-black tracking-tight text-danger">当前无法完成购买</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-danger/85">{perm.reason}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/reputation')}>查看我的信誉</Button>
            <Button variant="ghost" onClick={() => navigate('/complaints?tab=appeals')}>提交申诉</Button>
          </div>
        </Card>
      </div>
    )
  }

  const pay = () => {
    if (!agreed) {
      showToast('请先阅读并确认本次购买的商品、费用与交易规则。', 'error')
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      const reserved = reserveShares(carpool.id, slotIds)
      if (!reserved.ok || !reserved.data) {
        setSubmitting(false)
        showToast(reserved.message, 'error')
        navigate(`/detail/${carpool.id}`)
        return
      }
      const result = confirmPayment(carpool.id, reserved.data.reservationId, {
        simulateFailure: demoResult === 'failure',
        simulateTimeout: demoResult === 'timeout',
      })
      setSubmitting(false)
      if (!result.ok) {
        showToast(result.message, 'error')
        navigate(`/detail/${carpool.id}`)
        return
      }
      showToast(result.message, 'success')
      navigate(`/detail/${carpool.id}`)
    }, 600)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate(`/detail/${carpool.id}`)}>
        <span aria-hidden="true">←</span> 返回选择份额
      </button>

      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Confirm Purchase</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-ink sm:text-4xl">确认购买信息</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          付款成功后才会正式占位并生成有效订单；付款失败不会占用任何份额。首次购买只支付商品款。
        </p>
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-ink">商品与数量</h2>
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-primaryDark">
                {purchaseModeText[mode]}
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-bold text-primary">{group?.name} · {event?.name ?? carpool.eventName}</p>
              <h3 className="mt-2 text-lg font-bold leading-7 text-ink">{carpool.title}</h3>
            </div>

            <div className="mt-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">你将购买</p>
              <div className="space-y-2">
                {slots.map((slot) => {
                  const groupItem = (carpool.shareGroups ?? []).find((entry) => entry.slotIds.includes(slot.id))
                  const product = productsOf(data, carpool.eventId).find((item) => item.id === groupItem?.productId)
                  const title = product ? `${product.name} · ${product.spec}` : (groupItem?.name ?? slot.label)
                  const member = groupItem?.member
                  return (
                    <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-primaryDark">{title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-primary/75">
                          成员位置：{member ?? slot.label} · 数量 1
                        </p>
                      </div>
                      <span className="flex-none text-sm font-semibold text-ink">{money(slot.price ?? carpool.price)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <InfoRow label="数量">{quantity} 件</InfoRow>
              <InfoRow label="商品款合计">{money(goodsTotal)}</InfoRow>
              <InfoRow label="国际运费">{formatCents(carpool.internationalFreightCents ?? 0)}（整车，截团后按份数 AA）</InfoRow>
            </div>

            <div className="mt-4 rounded-xl bg-purple-50 px-4 py-3 text-xs leading-5 text-primaryDark">
              <p className="font-bold">国际运费后续 AA 提示</p>
              <p className="mt-1">
                整车国际运费在发车时确定，截团后按你的有效份数自动分摊并生成账单，届时再单独完成模拟支付。
                {mode === 'bundle' ? '整套凑套按成员位置份数均摊。' : '普通拼邮按商品件数均摊。'}
                车主自购部分同样参与分摊。
              </p>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-bold text-ink">款式保障与交易规则</h2>
            <div className="mt-4 space-y-3">
              <div className={`rounded-xl border p-4 ${carpool.guarantees?.fullSetOrdered ? 'border-success/20 bg-successSoft' : 'border-slate-200 bg-slate-50'}`}>
                <p className={`text-sm font-bold ${carpool.guarantees?.fullSetOrdered ? 'text-success' : 'text-ink'}`}>
                  {guaranteeText.fullSetOrdered.label}：{carpool.guarantees?.fullSetOrdered ? '已承诺' : '未承诺'}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted">{guaranteeText.fullSetOrdered.description}</p>
              </div>
              <div className={`rounded-xl border p-4 ${carpool.guarantees?.memberDesign ? 'border-success/20 bg-successSoft' : 'border-slate-200 bg-slate-50'}`}>
                <p className={`text-sm font-bold ${carpool.guarantees?.memberDesign ? 'text-success' : 'text-ink'}`}>
                  {guaranteeText.memberDesign.label}：{carpool.guarantees?.memberDesign ? '已承诺' : '未承诺'}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted">{guaranteeText.memberDesign.description}</p>
              </div>
            </div>

            <div className="my-5 h-px bg-slate-100" />

            <h3 className="font-bold text-ink">招募与交易规则</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted">{carpool.rules}</p>
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-ink">未凑齐 / 未成团时的处理</p>
              <p className="mt-1.5 text-xs leading-6 text-muted">{carpool.fallbackRule}</p>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              付款成功后不支持主动取消订单；未成团、缺货或采购失败等情形会进入退款流程并生成模拟退款记录。
              国内收货地址在到货后的地址收集阶段提交，不在本次购买中填写。
            </p>
          </Card>

          <Card className="border-primary/20 bg-purple-50/60 p-5 sm:p-6">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5 h-5 w-5 flex-none rounded border-slate-300 text-primary focus:ring-purple-200"
              />
              <span className="text-sm leading-6 text-ink">
                我已阅读并确认本次购买的商品名称规格、成员位置、数量、商品款合计、国际运费 AA 规则与招募交易规则（规则版本 v{carpool.rulesVersion ?? 1}）。
              </span>
            </label>
          </Card>

          <Card className="border-dashed border-slate-300 bg-slate-50/60 p-5 sm:p-6">
            <h2 className="text-sm font-bold text-ink">演示选项：模拟支付结果</h2>
            <p className="mt-1 text-xs leading-5 text-muted">用于演示失败与超时场景，不会调用任何真实支付接口。</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {([
                { key: 'success', label: '支付成功', hint: '正式占位并生成订单' },
                { key: 'failure', label: '支付失败', hint: '释放预留，不占用份额' },
                { key: 'timeout', label: '预留超时', hint: '预留过期，份额重新开放' },
              ] as Array<{ key: DemoResult; label: string; hint: string }>).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setDemoResult(item.key)}
                  aria-pressed={demoResult === item.key}
                  className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 ${
                    demoResult === item.key ? 'border-primary bg-purple-50' : 'border-slate-200 bg-white hover:border-purple-300'
                  }`}
                >
                  <p className={`text-sm font-bold ${demoResult === item.key ? 'text-primaryDark' : 'text-ink'}`}>{item.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted">{item.hint}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <aside className="md:sticky md:top-24">
          <Card className="p-5">
            {owner && (
              <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
                <Avatar user={owner} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{owner.nickname}</p>
                  <p className="text-[11px] text-muted">本车车主</p>
                </div>
              </div>
            )}
            <h2 className="font-bold text-ink">费用明细</h2>
            <div className="mt-3">
              <InfoRow label="商品款">{money(goodsTotal)}</InfoRow>
              <InfoRow label="数量">{quantity} 件</InfoRow>
              <InfoRow label="服务费">{money(0)}</InfoRow>
              <InfoRow label="截团时间">{formatFullDateTime(carpool.deadline)}</InfoRow>
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
              <span className="text-sm font-bold text-ink">本次应付</span>
              <span className="text-2xl font-black tracking-tight text-primaryDark">{money(goodsTotal)}</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted">国际运费在截团后另行生成账单，不在本次支付中收取。</p>
            <Button size="lg" loading={submitting} className="mt-5 w-full" onClick={pay} disabled={!agreed}>
              确认并完成模拟支付
            </Button>
            <p className="mt-3 text-center text-[11px] leading-5 text-muted">付款成功后才正式占位并生成有效订单</p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
