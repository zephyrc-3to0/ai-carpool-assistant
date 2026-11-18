import { useMemo, useState } from 'react'
import { Avatar, Button, Card, EmptyState, InfoRow } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { formatFullDateTime, money, navigate } from '../utils'

export function PaymentPage({ carpoolId, slotIds }: { carpoolId: string; slotIds: string[] }) {
  const { data, currentUser, joinCarpool, permissions } = useAppStore()
  const showToast = useToast()
  const [paying, setPaying] = useState(false)
  const [success, setSuccess] = useState(false)
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const perm = permissions

  const selectedSlots = useMemo(() => {
    if (!carpool) return []
    return carpool.positions.filter((slot) => slotIds.includes(slot.id))
  }, [carpool, slotIds])

  const selectionIsValid = Boolean(
    carpool &&
    carpool.status === 'recruiting' &&
    selectedSlots.length > 0 &&
    selectedSlots.length === slotIds.length &&
    (success || selectedSlots.every((slot) => !slot.occupantId)) &&
    carpool.ownerId !== currentUser.id
  )

  const total = (carpool?.price ?? 0) * selectedSlots.length

  if (!carpool) {
    return <EmptyState title="订单信息不存在" description="没有找到对应的拼车，请返回广场重新选择。" action={<Button onClick={() => navigate('/')}>返回广场</Button>} />
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl py-8 sm:py-14">
        <Card className="overflow-hidden text-center">
          <div className="bg-successSoft px-6 py-10">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success text-2xl font-bold text-white shadow-card" aria-hidden="true">✓</span>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-ink">上车成功</h1>
            <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-6 text-muted">模拟支付已完成，所选位置已经锁定。车主确认拼成后，系统会自动创建群聊。</p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="rounded-xl bg-slate-50 p-4 text-left">
              <p className="text-xs font-bold text-primary">{carpool.eventName}</p>
              <p className="mt-2 font-bold text-ink">{carpool.title}</p>
              <p className="mt-2 text-sm text-muted">位置：{selectedSlots.map((slot) => slot.label).join('、')}</p>
              <p className="mt-1 text-sm text-muted">支付：{money(total)}</p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>返回车次详情</Button>
              <Button onClick={() => navigate('/mine')}>查看我的拼车</Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (!selectionIsValid) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <EmptyState
          title="所选位置已不可支付"
          description="位置可能已被其他账号占用，或者车次已经停止招募。请返回详情页重新确认。"
          action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>重新选择位置</Button>}
        />
      </div>
    )
  }

  // V1.2 权限校验：信誉分不足 60 时不能加入新的拼车（服务端同样会拦截）
  if (!perm.canJoin) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <Card className="border-danger/20 bg-dangerSoft p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger text-lg font-black text-white" aria-hidden="true">!</span>
          <h1 className="mt-4 text-xl font-black tracking-tight text-danger">当前无法完成模拟支付</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-danger/85">{perm.reason}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-danger/70">{perm.hint}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/reputation')}>查看我的信誉</Button>
            <Button variant="ghost" onClick={() => navigate('/complaints?tab=appeals')}>提交申诉</Button>
          </div>
        </Card>
      </div>
    )
  }

  const confirmPayment = () => {
    setPaying(true)
    window.setTimeout(() => {
      const result = joinCarpool(carpool.id, slotIds)
      setPaying(false)
      if (!result.ok) {
        showToast(result.message, 'error')
        navigate(`/detail/${carpool.id}`)
        return
      }
      setSuccess(true)
      showToast(result.message, 'success')
    }, 900)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate(`/detail/${carpool.id}`)}>
        <span aria-hidden="true">←</span> 返回选择位置
      </button>

      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Mock Payment</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-ink sm:text-4xl">确认模拟支付</h1>
        <p className="mt-3 text-sm leading-6 text-muted">不会调用任何真实支付接口，也不会产生实际扣款。</p>
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h2 className="font-bold text-ink">订单内容</h2>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-bold text-primary">{carpool.eventName}</p>
              <h3 className="mt-2 text-lg font-bold leading-7 text-ink">{carpool.title}</h3>
              <p className="mt-1 text-sm text-muted">{carpool.productName}</p>
            </div>
            <div className="mt-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">已选位置</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedSlots.map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50 px-3.5 py-3">
                    <span className="text-sm font-bold text-primaryDark">{slot.label}</span>
                    <span className="text-sm font-semibold text-ink">{money(carpool.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-bold text-ink">支付账号</h2>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 p-4">
              <Avatar user={currentUser} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{currentUser.nickname}</p>
                <p className="mt-0.5 text-xs text-muted">当前模拟账号</p>
              </div>
              <span className="rounded-full bg-successSoft px-2.5 py-1 text-xs font-semibold text-success">已确认</span>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-ink">模拟余额</h2>
                <p className="mt-1 text-xs text-muted">仅用于完成课程演示流程</p>
              </div>
              <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-primary"><span className="h-2.5 w-2.5 rounded-full bg-primary" /></span>
            </div>
          </Card>
        </div>

        <aside className="md:sticky md:top-24">
          <Card className="p-5">
            <h2 className="font-bold text-ink">费用明细</h2>
            <div className="mt-3">
              <InfoRow label="位置单价">{money(carpool.price)}</InfoRow>
              <InfoRow label="位置数量">{selectedSlots.length} 个</InfoRow>
              <InfoRow label="服务费">{money(0)}</InfoRow>
              <InfoRow label="截单时间">{formatFullDateTime(carpool.deadline)}</InfoRow>
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
              <span className="text-sm font-bold text-ink">应付合计</span>
              <span className="text-2xl font-black tracking-tight text-primaryDark">{money(total)}</span>
            </div>
            <Button size="lg" loading={paying} className="mt-5 w-full" onClick={confirmPayment}>
              确认模拟支付
            </Button>
            <p className="mt-3 text-center text-[11px] leading-5 text-muted">点击后将锁定位置并生成本地订单</p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
