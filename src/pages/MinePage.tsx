import { ParticipationCard } from '../components/participation/ParticipationCard'
import { Button, EmptyState, PageHeader, cn } from '../components/UI'
import { useAppStore } from '../store'
import { getRoute, navigate } from '../utils'
import { getOrderAddress } from '../lib/logistics'
import { participationsOf } from '../lib/participation'

/**
 * V2.0「我参与的」：以车次为单位展示参与记录。
 * 我发起的车次统一在「车主管理」中查看，本页不再重复承载车主面板。
 */
export function MinePage() {
  const { data, currentUser } = useAppStore()
  const { searchParams } = getRoute()
  const focusCarId = searchParams.get('car') ?? undefined
  const participations = participationsOf(data, currentUser.id)
  const created = data.carpools.filter((carpool) => carpool.ownerId === currentUser.id)

  return (
    <>
      <PageHeader
        eyebrow="My Participation"
        title="我参与的"
        description={`当前以“${currentUser.nickname}”身份查看，切换顶部模拟账号可体验不同成员的数据。`}
        action={created.length ? (
          <Button variant="secondary" onClick={() => navigate('/manage')}>前往车主管理</Button>
        ) : undefined}
      />

      {participations.length ? (
        <div className="space-y-5">
          {participations.map((summary) => (
            <div key={summary.carpoolId} className="space-y-3">
              <ParticipationCard summary={summary} focusCarId={focusCarId} />
              <AddressReminder carpoolId={summary.carpoolId} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有参与拼车"
          description="去拼车广场选择一个商品或成员位置，完成模拟支付后会显示在这里。"
          action={<Button onClick={() => navigate('/')}>去拼车广场</Button>}
        />
      )}
    </>
  )
}

/** 待补充收货地址 / 逾期提醒（沿用 V1.1 的地址收集提示） */
function AddressReminder({ carpoolId }: { carpoolId: string }) {
  const { data, currentUser } = useAppStore()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return null
  const isRider = carpool.positions.some((slot) => slot.occupantId === currentUser.id && slot.occupantId !== carpool.ownerId)
  if (!isRider) return null
  const address = getOrderAddress(data, carpoolId, currentUser.id)
  const needAddress = Boolean(carpool.addressCollection?.enabled && address?.status !== 'submitted')
  if (!needAddress) return null
  const isOverdue = address?.status === 'overdue'

  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-card border p-4 sm:p-5', isOverdue ? 'border-danger/20 bg-dangerSoft' : 'border-amber-200 bg-amber-50')}>
      <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-xl text-sm font-black', isOverdue ? 'bg-danger text-white' : 'bg-amber-500 text-white')} aria-hidden="true">
        {isOverdue ? '!' : '📍'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-bold', isOverdue ? 'text-danger' : 'text-amber-800')}>
          {isOverdue ? '逾期未提交收货地址' : '待补充收货地址'}
        </p>
        <p className={cn('mt-1 text-xs leading-5', isOverdue ? 'text-danger/80' : 'text-amber-700')}>
          「{carpool.title}」的国际包裹已清关并开启地址收集，提交收货地址后车主才能为你打包发货。
        </p>
      </div>
      <Button size="sm" onClick={() => navigate(`/shipping/address/${carpool.id}`)}>
        {isOverdue ? '逾期补交地址' : '填写收货地址'}
      </Button>
    </div>
  )
}
