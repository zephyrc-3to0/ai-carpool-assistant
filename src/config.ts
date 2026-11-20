/**
 * V2.0 平台统一配置项。
 * 这些是可修改的统一配置，不要在多个页面里各写一份。
 */

/** 最低采购预留时间（小时）：最晚允许截团时间 = 官方下单截止时间 − 该时长 */
export const MIN_RESERVE_HOURS = 1

/** 国际运费尾差归属策略 ID（可替换，见 src/lib/money.ts） */
export const FREIGHT_REMAINDER_STRATEGY = 'largest'

/** 单个车次最多开放的商品条目数 */
export const MAX_OPEN_ITEMS = 24

/** 普通拼邮：整车国际包裹最大商品件数的取值范围 */
export const PACKAGE_ITEMS_RANGE = { min: 1, max: 60 } as const

/** 演示用的「当前时间」偏移不写死，页面按需计算 */
export const HOURS = 3600 * 1000
