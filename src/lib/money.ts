/**
 * V2.0 金额计算。
 *
 * 所有金额统一以「分」为单位的整数存储与运算，避免小数累加产生浮点误差。
 * 国际运费尾差的归属策略尚未最终确定，因此实现为独立、可替换的策略集合。
 */

/** 元 → 分 */
export function toCents(yuan: number) {
  if (!Number.isFinite(yuan)) return 0
  return Math.round(yuan * 100)
}

/** 分 → 元 */
export function fromCents(cents: number) {
  return cents / 100
}

/** 金额展示 */
export function formatCents(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`
}

export interface RemainderStrategy {
  id: string
  label: string
  description: string
  /**
   * 把总额按权重分摊，返回每份应摊金额（分）。
   * 保证 sum(result) === totalCents。
   */
  distribute(totalCents: number, weights: number[]): number[]
}

/** 基础分摊：按权重比例向下取整，剩余尾差单独处理 */
function baseShares(totalCents: number, weights: number[]) {
  const sum = weights.reduce((total, weight) => total + weight, 0)
  if (sum <= 0) return weights.map(() => 0)
  return weights.map((weight) => Math.floor((totalCents * weight) / sum))
}

/** 尾差由份数最多的参与者承担（默认） */
const largestRemainder: RemainderStrategy = {
  id: 'largest',
  label: '尾差由份数最多者承担',
  description: '按份数比例向下取整后产生的尾差，由份数最多的参与者承担。',
  distribute(totalCents, weights) {
    const shares = baseShares(totalCents, weights)
    let remainder = totalCents - shares.reduce((total, value) => total + value, 0)
    if (remainder === 0) return shares
    const order = weights
      .map((weight, index) => ({ weight, index }))
      .sort((a, b) => b.weight - a.weight || a.index - b.index)
    let cursor = 0
    while (remainder > 0 && order.length) {
      shares[order[cursor % order.length].index] += 1
      remainder -= 1
      cursor += 1
    }
    return shares
  },
}

/** 尾差由最先参与的参与者承担 */
const firstRemainder: RemainderStrategy = {
  id: 'first',
  label: '尾差由最先参与者承担',
  description: '尾差由参与顺序最靠前的参与者承担。',
  distribute(totalCents, weights) {
    const shares = baseShares(totalCents, weights)
    let remainder = totalCents - shares.reduce((total, value) => total + value, 0)
    for (let index = 0; remainder > 0 && index < shares.length; index += 1) {
      shares[index] += 1
      remainder -= 1
    }
    return shares
  },
}

/** 可替换的尾差策略集合；每种策略都必须保证分摊合计等于整车总额。 */
export const remainderStrategies: RemainderStrategy[] = [
  largestRemainder,
  firstRemainder,
]

/** 默认策略 */
export const DEFAULT_REMAINDER_STRATEGY = 'largest'

export function remainderStrategyOf(id?: string): RemainderStrategy {
  return remainderStrategies.find((strategy) => strategy.id === id) ?? largestRemainder
}

/**
 * 按权重分摊金额（分）。
 * @param totalCents 总额
 * @param weights 每份的权重（件 / 份数）
 * @param strategyId 尾差策略
 */
export function allocateByWeight(totalCents: number, weights: number[], strategyId?: string) {
  const strategy = remainderStrategyOf(strategyId)
  const shares = strategy.distribute(totalCents, weights)
  return {
    shares,
    allocatedCents: shares.reduce((total, value) => total + value, 0),
    remainderCents: totalCents - shares.reduce((total, value) => total + value, 0),
    strategy,
  }
}
