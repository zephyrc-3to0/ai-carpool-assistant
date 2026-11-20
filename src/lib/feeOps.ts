/**
 * V2.0 费用相关状态迁移：国际运费账单支付、国内费用登记与支付、费用异议。
 */
import type { AppData, DomesticFeeBill, ExceptionRecord, FreightBill, PaymentRecord } from '../types'
import { toCents } from './money'
import { uid } from '../utils'

export interface OpResult<T = undefined> {
  ok: boolean
  message: string
  next: AppData
  data?: T
}

const fail = <T,>(message: string, data: AppData): OpResult<T> => ({ ok: false, message, next: data })
const done = <T,>(message: string, data: AppData, payload?: T): OpResult<T> => ({ ok: true, message, next: data, data: payload })

const now = () => new Date().toISOString()

/**
 * 车员支付国际运费账单。
 * 车主本人的分摊只做记账，不产生向自己的模拟付款，因此车主账单不会出现在这里。
 */
export function payFreightOp(data: AppData, userId: string, carpoolId: string): OpResult<PaymentRecord> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId === userId) {
    return fail('车主本人的国际运费分摊只做记账，不需要付款。', data)
  }
  const bill = (data.freightBills ?? []).find(
    (item) => item.carpoolId === carpoolId && item.userId === userId,
  )
  if (!bill) return fail('你没有国际运费账单。', data)
  if (bill.status === 'paid') return fail('国际运费已经支付过了。', data)

  const timestamp = now()
  const payment: PaymentRecord = {
    id: uid('pay'),
    carpoolId,
    userId,
    kind: 'freight',
    amountCents: bill.amountCents,
    status: 'paid',
    refId: bill.id,
    note: '国际运费模拟支付',
    createdAt: timestamp,
  }

  const next: AppData = {
    ...data,
    freightBills: (data.freightBills ?? []).map((item) => (item.id === bill.id ? { ...item, status: 'paid' as const, paymentId: payment.id, paidAt: timestamp } : item)),
    payments: [...(data.payments ?? []), payment],
  }
  return done('国际运费已支付。', next, payment)
}

export interface DomesticFeeInput {
  /** 打包费（元） */
  packingFee: number
  /** 国内运费（元） */
  shippingFee: number
}

/**
 * 车主按车员登记国内打包费与国内运费。
 * 不同车员相互独立，不要求整车一起支付。
 */
export function registerDomesticFeesOp(
  data: AppData,
  ownerId: string,
  carpoolId: string,
  userId: string,
  input: DomesticFeeInput,
): OpResult<DomesticFeeBill> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以登记国内费用。', data)
  if (userId === carpool.ownerId || !carpool.positions.some((slot) => slot.occupantId === userId)) {
    return fail('只能为本车已参与的车员登记国内费用。', data)
  }
  if (!Number.isFinite(input.packingFee) || !Number.isFinite(input.shippingFee) || input.packingFee < 0 || input.shippingFee < 0) {
    return fail('打包费和国内运费不能为负数。', data)
  }
  if (carpool.requiresDomesticFee) {
    const address = data.orderAddresses.find((item) => item.carpoolId === carpoolId && item.userId === userId)
    if (address?.status !== 'submitted') return fail('该车员提交有效收货地址后，才能登记国内费用。', data)
  }

  const packingFeeCents = toCents(input.packingFee)
  const shippingFeeCents = Math.max(0, toCents(input.shippingFee))
  const existing = (data.domesticFeeBills ?? []).find(
    (item) => item.carpoolId === carpoolId && item.userId === userId,
  )
  if (existing?.status === 'paid') return fail('该车员已经支付国内费用，不能再修改账单。', data)
  if (existing?.status === 'disputed') return fail('该账单存在费用异议，请先在异常处理中心完成处理。', data)
  const timestamp = now()
  const bill: DomesticFeeBill = {
    id: existing?.id ?? uid('dfee'),
    carpoolId,
    userId,
    packingFeeCents,
    shippingFeeCents,
    totalCents: packingFeeCents + shippingFeeCents,
    status: 'pending',
    createdAt: existing?.createdAt ?? timestamp,
  }
  const next: AppData = {
    ...data,
    domesticFeeBills: [
      bill,
      ...(data.domesticFeeBills ?? []).filter((item) => !(item.carpoolId === carpoolId && item.userId === userId)),
    ],
  }
  return done('国内费用已登记。', next, bill)
}

/** 车员支付国内费用 */
export function payDomesticFeeOp(data: AppData, userId: string, carpoolId: string): OpResult<PaymentRecord> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  const bill = (data.domesticFeeBills ?? []).find(
    (item) => item.carpoolId === carpoolId && item.userId === userId,
  )
  if (!bill) return fail('车主还没有登记你的国内费用。', data)
  if (bill.status === 'paid') return fail('国内费用已经支付过了。', data)
  if (bill.status === 'disputed') return fail('这笔国内费用存在异议，请等待车主处理。', data)

  const timestamp = now()
  const payment: PaymentRecord = {
    id: uid('pay'),
    carpoolId,
    userId,
    kind: 'domestic',
    amountCents: bill.totalCents,
    status: 'paid',
    refId: bill.id,
    note: '国内打包费与运费模拟支付',
    createdAt: timestamp,
  }
  const next: AppData = {
    ...data,
    domesticFeeBills: (data.domesticFeeBills ?? []).map((item) => (item.id === bill.id ? { ...item, status: 'paid' as const, paymentId: payment.id, paidAt: timestamp } : item)),
    payments: [...(data.payments ?? []), payment],
  }
  return done('国内费用已支付。', next, payment)
}

/** 车员对待支付的国内费用发起异议，并同步进入单车异常处理中心。 */
export function disputeDomesticFeeOp(
  data: AppData,
  userId: string,
  carpoolId: string,
  detail: string,
): OpResult<ExceptionRecord> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (!carpool.positions.some((slot) => slot.occupantId === userId) || carpool.ownerId === userId) {
    return fail('只有本车车员可以对自己的国内费用发起异议。', data)
  }
  const bill = (data.domesticFeeBills ?? []).find((item) => item.carpoolId === carpoolId && item.userId === userId)
  if (!bill) return fail('车主还没有登记你的国内费用。', data)
  if (bill.status === 'paid') return fail('这笔国内费用已经支付，不能通过待支付账单入口发起异议。', data)
  if (bill.status === 'disputed') return fail('这笔费用已经存在待处理异议。', data)
  const normalized = detail.trim()
  if (normalized.length < 5) return fail('请至少用 5 个字说明费用异议。', data)

  const timestamp = now()
  const record: ExceptionRecord = {
    id: uid('exc'),
    carpoolId,
    userId,
    type: 'fee',
    title: '国内费用异议',
    detail: normalized,
    status: 'open',
    createdAt: timestamp,
  }
  const next: AppData = {
    ...data,
    domesticFeeBills: (data.domesticFeeBills ?? []).map((item) => (
      item.id === bill.id ? { ...item, status: 'disputed' as const } : item
    )),
    exceptions: [record, ...(data.exceptions ?? [])],
  }
  return done('费用异议已提交，等待车主处理。', next, record)
}

/** 取车次中某个用户的国际运费账单 */
export function freightBillOf(data: AppData, carpoolId: string, userId: string): FreightBill | undefined {
  return (data.freightBills ?? []).find((item) => item.carpoolId === carpoolId && item.userId === userId)
}

/** 取车次中某个用户的国内费用账单 */
export function domesticFeeBillOf(data: AppData, carpoolId: string, userId: string): DomesticFeeBill | undefined {
  return (data.domesticFeeBills ?? []).find((item) => item.carpoolId === carpoolId && item.userId === userId)
}
