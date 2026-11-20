import { useEffect, useMemo, useState } from 'react'
import { AddressStatusBadge, DomesticStatusBadge, InternationalStatusBadge, ShipmentTimeline, StatusSteps } from '../components/Logistics'
import { Avatar, Button, Card, EmptyState, InfoRow, inputClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import type { InternationalStatus } from '../types'
import {
  formatAddress,
  formatFullDateTime,
  internationalStatusOrder,
  internationalStatusText,
  navigate,
  toLocalInput,
  fromLocalInput,
} from '../utils'
import { deriveDomesticStatus, getDomesticShipment, getInternationalShipment, getOrderAddress } from '../lib/logistics'
import { formatCents } from '../lib/money'

export function ShippingManagePage({ carpoolId }: { carpoolId: string }) {
  const {
    data,
    currentUser,
    updateInternationalShipment,
    confirmArrivalCheck,
    urgeAddress,
    registerDomesticFees,
    saveDomesticShipment,
  } = useAppStore()
  const showToast = useToast()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const shipment = getInternationalShipment(data, carpoolId)

  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [status, setStatus] = useState<InternationalStatus>('waiting')
  const [note, setNote] = useState('')
  const [domesticForms, setDomesticForms] = useState<Record<string, { carrier: string; trackingNumber: string; shippedAt: string; note: string }>>({})
  const [feeForms, setFeeForms] = useState<Record<string, { packingFee: string; shippingFee: string }>>({})

  useEffect(() => {
    setCarrier(shipment?.carrier ?? '')
    setTrackingNumber(shipment?.trackingNumber ?? '')
    setTrackingUrl(shipment?.trackingUrl ?? '')
    setStatus(shipment?.status ?? 'waiting')
    setNote(shipment?.note ?? '')
  }, [shipment?.id, shipment?.status, shipment?.carrier, shipment?.trackingNumber, shipment?.trackingUrl, shipment?.note, shipment?.updatedAt])

  useEffect(() => {
    const next: Record<string, { carrier: string; trackingNumber: string; shippedAt: string; note: string }> = {}
    carpool?.positions.forEach((slot) => {
      if (!slot.occupantId || slot.occupantId === carpool.ownerId) return
      const record = getDomesticShipment(data, carpoolId, slot.occupantId)
      next[slot.occupantId] = {
        carrier: record?.carrier ?? '',
        trackingNumber: record?.trackingNumber ?? '',
        shippedAt: toLocalInput(record?.shippedAt),
        note: record?.note ?? '',
      }
    })
    setDomesticForms(next)
    // 仅在发货记录或车员名单变化时回填表单，避免其他状态更新打断正在输入的内容
  }, [data.domesticShipments, carpool, carpoolId])

  useEffect(() => {
    const next: Record<string, { packingFee: string; shippingFee: string }> = {}
    carpool?.positions.forEach((slot) => {
      if (!slot.occupantId || slot.occupantId === carpool.ownerId || next[slot.occupantId]) return
      const bill = (data.domesticFeeBills ?? []).find((item) => item.carpoolId === carpoolId && item.userId === slot.occupantId)
      next[slot.occupantId] = {
        packingFee: bill ? String(bill.packingFeeCents / 100) : '',
        shippingFee: bill ? String(bill.shippingFeeCents / 100) : '',
      }
    })
    setFeeForms(next)
  }, [data.domesticFeeBills, carpool, carpoolId])

  const riders = useMemo(() => {
    if (!carpool) return []
    const ids = new Set<string>()
    carpool.positions.forEach((slot) => {
      if (slot.occupantId && slot.occupantId !== carpool.ownerId) ids.add(slot.occupantId)
    })
    return [...ids]
      .map((id) => data.users.find((user) => user.id === id))
      .filter(Boolean)
      .map((user) => user!)
  }, [carpool, data.users])

  if (!carpool) {
    return <EmptyState title="没有找到这辆拼车" description="返回车主管理查看你发起的其他车次。" action={<Button onClick={() => navigate('/manage')}>返回车主管理</Button>} />
  }
  if (carpool.ownerId !== currentUser.id) {
    return <EmptyState title="你不是这辆车的车主" description="切换到对应的模拟账号后，才可以录入物流与发货信息。" action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次详情</Button>} />
  }

  const addressRecords = riders.map((rider) => ({
    rider,
    address: getOrderAddress(data, carpoolId, rider.id),
  }))
  const submittedCount = addressRecords.filter((item) => item.address?.status === 'submitted').length
  const pendingCount = addressRecords.length - submittedCount
  const collection = carpool.addressCollection
  const collectionOpen = Boolean(collection?.enabled)
  const freightBills = (data.freightBills ?? []).filter((bill) => bill.carpoolId === carpoolId)
  const freightPaid = freightBills.filter((bill) => bill.status === 'paid').length
  const freightBooked = freightBills.filter((bill) => bill.status === 'booked').length

  const saveShipment = () => {
    const result = updateInternationalShipment(carpoolId, { carrier, trackingNumber, trackingUrl, status, note })
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const saveDomestic = (userId: string) => {
    const form = domesticForms[userId]
    if (!form) return
    const result = saveDomesticShipment(carpoolId, userId, {
      carrier: form.carrier,
      trackingNumber: form.trackingNumber,
      shippedAt: fromLocalInput(form.shippedAt),
      note: form.note,
    })
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const saveFees = (userId: string) => {
    const form = feeForms[userId]
    if (!form) return
    const result = registerDomesticFees(carpoolId, userId, {
      packingFee: Number(form.packingFee),
      shippingFee: Number(form.shippingFee),
    })
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const updateFeeForm = (userId: string, key: 'packingFee' | 'shippingFee', value: string) => {
    setFeeForms((current) => ({
      ...current,
      [userId]: { ...(current[userId] ?? { packingFee: '', shippingFee: '' }), [key]: value },
    }))
  }

  const markReceived = (userId: string) => {
    const form = domesticForms[userId]
    if (!form) return
    const result = saveDomesticShipment(carpoolId, userId, {
      carrier: form.carrier,
      trackingNumber: form.trackingNumber,
      shippedAt: fromLocalInput(form.shippedAt),
      note: form.note,
      status: 'received',
    })
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const updateDomesticForm = (userId: string, key: 'carrier' | 'trackingNumber' | 'shippedAt' | 'note', value: string) => {
    setDomesticForms((current) => ({
      ...current,
      [userId]: { ...(current[userId] ?? { carrier: '', trackingNumber: '', shippedAt: '', note: '' }), [key]: value },
    }))
  }

  return (
    <>
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate(`/manage/${carpoolId}`)}>
        <span aria-hidden="true">←</span> 返回车次管理
      </button>

      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Logistics Management</p>
          <h1 className="text-balance text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">物流管理</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{carpool.title} · {carpool.productName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>查看公开详情</Button>
          <Button variant="secondary" onClick={() => navigate(`/manage/${carpool.id}`)}>车次管理</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* 国际物流 */}
          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">International</p>
                <h2 className="mt-2 text-xl font-bold text-ink">国际物流</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted">整辆车共享同一份物流信息，所有车员都能查看。</p>
              </div>
              {shipment && <InternationalStatusBadge status={shipment.status} />}
            </div>

            <StatusSteps current={shipment?.status ?? 'waiting'} order={internationalStatusOrder} labels={internationalStatusText} />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">国际物流公司 *</span>
                <input className={inputClass} value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="例如：DHL Express" maxLength={40} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">国际物流单号 *</span>
                <input className={inputClass} value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="例如：JD014600008821" maxLength={40} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">物流查询链接（可选）</span>
                <input className={inputClass} value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} placeholder="https://" maxLength={200} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">物流状态 *</span>
                <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as InternationalStatus)}>
                  {internationalStatusOrder.map((item) => (
                    <option key={item} value={item}>{internationalStatusText[item]}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-ink">物流状态说明</span>
                <textarea className={`${inputClass} min-h-24 resize-y py-3 leading-6`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：包裹已发出，预计 5-7 个工作日到达。" maxLength={200} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button onClick={saveShipment}>保存物流信息</Button>
              {shipment && <span className="text-xs text-muted">最后更新：{formatFullDateTime(shipment.updatedAt)}</span>}
            </div>

            {collectionTriggerHint(status, collectionOpen) && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                {collectionTriggerHint(status, collectionOpen)}
              </p>
            )}

            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-bold text-ink">物流进度时间线</h3>
              <div className="mt-4">
                <ShipmentTimeline entries={shipment?.timeline ?? []} />
              </div>
            </div>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-bold text-ink">到货检查</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">收到国际包裹并确认商品无误后，标记为「车主已签收」，再完成到货检查。本车将进入国内发货阶段。</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={shipment?.status !== 'received'}
                  onClick={() => {
                    const result = confirmArrivalCheck(carpoolId)
                    showToast(result.message, result.ok ? 'success' : 'error')
                  }}
                >
                  确认到货检查完成
                </Button>
                {shipment?.status !== 'received' && <span className="text-xs text-muted">需要先将状态更新为「车主已签收」。</span>}
              </div>
            </div>
          </Card>

          {/* 地址收集 */}
          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Address Collection</p>
                <h2 className="mt-2 text-xl font-bold text-ink">地址收集</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted">
                  {collectionOpen
                    ? collection?.closedAt
                      ? '地址收集阶段已结束，未提交地址的成员仍可补交。'
                      : '地址收集进行中，请车员尽快填写收货地址。'
                    : '国际包裹清关完成并进入国内运输后，系统会自动开启地址收集。'}
                </p>
              </div>
              <div className="flex gap-2">
                <Stat label="车员总数" value={riders.length} />
                <Stat label="已提交" value={submittedCount} tone="success" />
                <Stat label="未提交" value={pendingCount} tone={pendingCount > 0 ? 'danger' : 'muted'} />
              </div>
            </div>

            {riders.length ? (
              <div className="divide-y divide-slate-100">
                {addressRecords.map(({ rider, address }) => {
                  const statusValue = address?.status ?? 'pending'
                  return (
                    <div key={rider.id} className="py-5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <Avatar user={rider} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink">{rider.nickname}</p>
                          {address?.status === 'submitted' ? (
                            <p className="mt-1 text-xs leading-5 text-muted">
                              {address.receiverName} · {address.phone} · {formatAddress(address)}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-muted">
                              {statusValue === 'overdue' ? '已过地址收集期限，仍可补交地址。' : '尚未提交收货地址。'}
                              {address?.urgedAt && ` 最近催促：${formatFullDateTime(address.urgedAt)}`}
                            </p>
                          )}
                        </div>
                        <AddressStatusBadge status={statusValue} />
                        {statusValue !== 'submitted' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const result = urgeAddress(carpoolId, rider.id)
                              showToast(result.message, result.ok ? 'success' : 'error')
                            }}
                          >
                            催促填写
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                <p className="text-sm font-bold text-ink">还没有车员加入</p>
                <p className="mt-2 text-xs leading-5 text-muted">有车员上车后，这里会显示地址收集进度。</p>
              </div>
            )}
          </Card>

          {/* 国内发货 */}
          <Card className="p-5 sm:p-7">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Domestic</p>
              <h2 className="mt-2 text-xl font-bold text-ink">国内发货</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted">为每位车员单独录入快递公司与单号，数据相互独立，车员只能查看自己的记录。</p>
            </div>

            {riders.length ? (
              <div className="space-y-4">
                {riders.map((rider) => {
                  const form = domesticForms[rider.id] ?? { carrier: '', trackingNumber: '', shippedAt: '', note: '' }
                  const domesticStatus = deriveDomesticStatus(data, carpoolId, rider.id)
                  const address = getOrderAddress(data, carpoolId, rider.id)
                  const feeBill = (data.domesticFeeBills ?? []).find((item) => item.carpoolId === carpoolId && item.userId === rider.id)
                  const feeForm = feeForms[rider.id] ?? { packingFee: '', shippingFee: '' }
                  const canShip = address?.status === 'submitted' && (!carpool.requiresDomesticFee || feeBill?.status === 'paid')
                  return (
                    <div key={rider.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <Avatar user={rider} size="sm" />
                        <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{rider.nickname}</p>
                        <DomesticStatusBadge status={domesticStatus} />
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          feeBill?.status === 'paid'
                            ? 'bg-successSoft text-success'
                            : feeBill?.status === 'disputed'
                              ? 'bg-dangerSoft text-danger'
                              : 'bg-amber-50 text-amber-700'
                        }`}>
                          国内费用{feeBill?.status === 'paid' ? '已支付' : feeBill?.status === 'disputed' ? '有异议' : feeBill ? '待支付' : '未登记'}
                        </span>
                      </div>

                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-ink">国内费用</p>
                          {feeBill && <span className="text-[11px] text-muted">合计 {formatCents(feeBill.totalCents)}</span>}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1.5 block text-[11px] font-semibold text-muted">打包费（元）</span>
                            <input type="number" min="0" step="0.01" className={inputClass} value={feeForm.packingFee} disabled={feeBill?.status === 'paid' || feeBill?.status === 'disputed'} onChange={(event) => updateFeeForm(rider.id, 'packingFee', event.target.value)} />
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-[11px] font-semibold text-muted">国内运费（元）</span>
                            <input type="number" min="0" step="0.01" className={inputClass} value={feeForm.shippingFee} disabled={feeBill?.status === 'paid' || feeBill?.status === 'disputed'} onChange={(event) => updateFeeForm(rider.id, 'shippingFee', event.target.value)} />
                          </label>
                        </div>
                        <Button size="sm" variant="secondary" className="mt-3" disabled={address?.status !== 'submitted' || feeBill?.status === 'paid' || feeBill?.status === 'disputed'} onClick={() => saveFees(rider.id)}>
                          {feeBill ? '更新国内费用' : '登记国内费用'}
                        </Button>
                        {address?.status !== 'submitted' && <p className="mt-2 text-[11px] text-muted">车员提交地址后才能登记费用。</p>}
                      </div>

                      {!canShip && (
                        <p className="mt-3 rounded-xl border border-danger/20 bg-dangerSoft px-3 py-2 text-xs leading-5 text-danger">
                          {address?.status !== 'submitted'
                            ? '该车员尚未提交有效收货地址，暂不能发货。'
                            : feeBill?.status === 'disputed'
                              ? '该车员的国内费用存在异议，处理完成后才能发货。'
                              : '该车员尚未完成国内费用模拟支付，暂不能发货。'}
                        </p>
                      )}

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold text-ink">国内快递公司</span>
                          <input className={inputClass} value={form.carrier} onChange={(event) => updateDomesticForm(rider.id, 'carrier', event.target.value)} placeholder="例如：中通快递" maxLength={40} />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold text-ink">国内快递单号</span>
                          <input className={inputClass} value={form.trackingNumber} onChange={(event) => updateDomesticForm(rider.id, 'trackingNumber', event.target.value)} placeholder="例如：ZT7712345678901" maxLength={40} />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold text-ink">发货时间</span>
                          <input type="datetime-local" className={inputClass} value={form.shippedAt} onChange={(event) => updateDomesticForm(rider.id, 'shippedAt', event.target.value)} />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold text-ink">发货备注（可选）</span>
                          <input className={inputClass} value={form.note} onChange={(event) => updateDomesticForm(rider.id, 'note', event.target.value)} placeholder="例如：已验货无瑕疵" maxLength={60} />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button size="sm" disabled={!canShip && domesticStatus !== 'shipped' && domesticStatus !== 'received'} onClick={() => saveDomestic(rider.id)}>保存发货信息</Button>
                        <Button size="sm" variant="secondary" disabled={domesticStatus !== 'shipped'} onClick={() => markReceived(rider.id)}>标记已签收</Button>
                        {domesticStatus === 'shipped' && <span className="text-[11px] text-muted">该车员已收到发货通知。</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                <p className="text-sm font-bold text-ink">还没有车员加入</p>
                <p className="mt-2 text-xs leading-5 text-muted">有车员上车后，这里会显示待发货名单。</p>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="font-bold text-ink">物流概览</h2>
            <div className="mt-4">
              <InfoRow label="物流公司">{shipment?.carrier || '未录入'}</InfoRow>
              <InfoRow label="物流单号">{shipment?.trackingNumber || '未录入'}</InfoRow>
              <InfoRow label="当前状态">{shipment ? internationalStatusText[shipment.status] : '未录入'}</InfoRow>
              <InfoRow label="整车国际运费">{formatCents(carpool.internationalFreightCents ?? 0)}</InfoRow>
              <InfoRow label="国际运费结算">{freightBills.length ? `${freightPaid} 人已付 · ${freightBooked} 笔车主记账 · ${freightBills.length - freightPaid - freightBooked} 人待付` : '截团后生成'}</InfoRow>
              <InfoRow label="地址收集">{collectionOpen ? (collection?.closedAt ? '已结束' : '进行中') : '未开启'}</InfoRow>
              <InfoRow label="地址提交">{submittedCount} / {riders.length}</InfoRow>
            </div>
          </Card>

          <Card className="border-purple-200 bg-purple-50/60 p-5">
            <h2 className="font-bold text-ink">演示说明</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              物流公司、单号与节点均为车主手动录入的模拟数据，未接入真实物流查询接口；「已签收」也由车主手动更新，不会伪装成快递公司的自动同步。
            </p>
          </Card>
        </aside>
      </div>
    </>
  )
}

function Stat({ label, value, tone = 'primary' }: { label: string; value: number; tone?: 'primary' | 'success' | 'danger' | 'muted' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : tone === 'muted' ? 'text-muted' : 'text-ink'
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-center">
      <p className={`text-lg font-black tracking-tight ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
    </div>
  )
}

function collectionTriggerHint(status: InternationalStatus, collectionOpen: boolean) {
  if (collectionOpen) return ''
  if (status === 'domestic_transit' || status === 'received' || status === 'checked') {
    return '保存后系统会开启本车地址收集，并向车员发送清关完成后的地址提醒。'
  }
  return ''
}
