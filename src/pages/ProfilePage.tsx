import { ReputationChip } from '../components/Reputation'
import { Avatar, Button, Card, PageHeader } from '../components/UI'
import { useAppStore } from '../store'
import { hasFulfillmentRecord } from '../lib/reputation'
import { navigate } from '../utils'

export function ProfilePage() {
  const { data, currentUser, reputationOf, permissions, setAdminMode } = useAppStore()
  const myAddresses = data.savedAddresses.filter((item) => item.userId === currentUser.id)
  const unread = data.notifications.filter((item) => item.userId === currentUser.id && !item.read).length
  const joined = data.carpools.filter((carpool) => carpool.positions.some((slot) => slot.occupantId === currentUser.id)).length
  const created = data.carpools.filter((carpool) => carpool.ownerId === currentUser.id).length
  const reputation = reputationOf(currentUser.id)
  const perm = permissions
  const hasRecord = hasFulfillmentRecord(data, currentUser.id)

  return (
    <>
      <PageHeader
        eyebrow="My Profile"
        title="个人中心"
        description={`当前模拟身份为“${currentUser.nickname}”，切换右上角账号可以体验车主与车员的完整流程。`}
      />

      <Card className="mb-5 flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <Avatar user={currentUser} size="lg" />
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink">{currentUser.nickname}</p>
          <p className="mt-1 text-xs text-muted">模拟账号 · {currentUser.id}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ReputationChip reputation={reputation} />
            {!hasRecord && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-muted">暂无履约记录</span>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-6 text-center">
          <div>
            <p className="text-xl font-black text-ink">{joined}</p>
            <p className="mt-0.5 text-[11px] text-muted">加入的车次</p>
          </div>
          <div>
            <p className="text-xl font-black text-ink">{created}</p>
            <p className="mt-0.5 text-[11px] text-muted">发起的车次</p>
          </div>
        </div>
      </Card>

      {perm.reason && (
        <Card className="mb-5 border-danger/20 bg-dangerSoft p-5">
          <p className="text-sm font-bold text-danger">当前功能受限</p>
          <p className="mt-1 text-sm leading-6 text-danger/85">{perm.reason}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigate('/complaints?tab=appeals')}>提交申诉</Button>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Reputation</p>
          <h2 className="mt-2 text-lg font-bold text-ink">我的信誉</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            当前信誉分 {reputation.score} 分，查看等级、可用权限、变动历史，并可对扣分提交申诉。
          </p>
          <Button className="mt-5" onClick={() => navigate('/reputation')}>查看我的信誉</Button>
        </Card>

        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Complaints</p>
          <h2 className="mt-2 text-lg font-bold text-ink">投诉与申诉</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            针对车次成员提交投诉，或查看已提交投诉与申诉的处理进度。
          </p>
          <Button variant="secondary" className="mt-5" onClick={() => navigate('/complaints')}>前往投诉与申诉</Button>
        </Card>

        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Address Book</p>
          <h2 className="mt-2 text-lg font-bold text-ink">我的地址</h2>
          <p className="mt-2 text-sm leading-6 text-muted">管理常用收货地址，已保存 {myAddresses.length} 条。</p>
          <Button variant="secondary" className="mt-5" onClick={() => navigate('/addresses')}>管理地址</Button>
        </Card>

        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Notifications</p>
          <h2 className="mt-2 text-lg font-bold text-ink">站内通知</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {unread > 0 ? `有 ${unread} 条未读消息，包括物流、地址与信誉提醒。` : '暂时没有未读通知。'}
          </p>
          <Button variant="secondary" className="mt-5" onClick={() => navigate('/notifications')}>查看通知</Button>
        </Card>

        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">My Carpools</p>
          <h2 className="mt-2 text-lg font-bold text-ink">我的拼车</h2>
          <p className="mt-2 text-sm leading-6 text-muted">查看加入的与发起的车次，以及物流与收货地址进度。</p>
          <Button variant="secondary" className="mt-5" onClick={() => navigate('/mine')}>前往我的拼车</Button>
        </Card>

        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Owner Console</p>
          <h2 className="mt-2 text-lg font-bold text-ink">车主管理</h2>
          <p className="mt-2 text-sm leading-6 text-muted">管理发起车次的成员、物流信息与国内发货。</p>
          <Button variant="secondary" className="mt-5" onClick={() => navigate('/manage')}>前往车主管理</Button>
        </Card>

        <Card className="border-ink/15 bg-slate-50 p-5 transition hover:border-ink/30 hover:shadow-hover sm:col-span-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink">Admin Demo</p>
          <h2 className="mt-2 text-lg font-bold text-ink">模拟管理员后台</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            仅用于课程演示：进入管理员模式后可以核实投诉、确认或驳回违规、审核申诉，并查看信誉分变动记录与操作日志。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant={data.adminMode ? 'secondary' : 'primary'}
              onClick={() => {
                setAdminMode(!data.adminMode)
                navigate(data.adminMode ? '/profile' : '/admin')
              }}
            >
              {data.adminMode ? '退出演示管理员模式' : '进入演示管理员模式'}
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/user/${currentUser.id}`)}>查看我的公开主页</Button>
          </div>
        </Card>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white px-5 py-4 text-xs leading-6 text-muted">
        本项目为课程演示：所有账号、拼车、支付、物流、地址与信誉数据均为本地模拟，不接入真实支付、物流查询与短信服务，也不构成真实的数据隔离或安全保护；信誉分与权限控制不代表真实平台的安全认证。
      </div>
    </>
  )
}
