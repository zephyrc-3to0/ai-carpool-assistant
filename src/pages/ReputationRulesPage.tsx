import { Button, Card, PageHeader } from '../components/UI'
import { ReputationLevelBadge } from '../components/Reputation'
import { useAppStore } from '../store'
import { levelMeta, MONTHLY_REWARD_CAP, REPUTATION_MAX, REPUTATION_MIN } from '../lib/reputation'
import { complaintCategoryMeta } from '../lib/reputationOps'
import type { ComplaintCategory } from '../types'
import { navigate } from '../utils'

const levelRows: Array<{ range: string; level: 'excellent' | 'good' | 'caution' | 'restricted' }> = [
  { range: '90 – 100 分', level: 'excellent' },
  { range: '70 – 89 分', level: 'good' },
  { range: '60 – 69 分', level: 'caution' },
  { range: '0 – 59 分', level: 'restricted' },
]

export function ReputationRulesPage() {
  const { currentUser } = useAppStore()

  return (
    <>
      <PageHeader
        eyebrow="Reputation Rules"
        title="信誉规则说明"
        description={`信誉分范围为 ${REPUTATION_MIN}–${REPUTATION_MAX} 分，初始值为 100 分。分数变化只来自实际履约与平台核实的违规记录。`}
        action={<Button variant="secondary" onClick={() => navigate('/reputation')}>返回我的信誉</Button>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">信誉等级与可用权限</h2>
            <div className="mt-4 space-y-3">
              {levelRows.map((row) => (
                <div key={row.range} className="flex flex-wrap items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="w-24 flex-none text-sm font-black tracking-tight text-ink">{row.range}</span>
                  <ReputationLevelBadge level={row.level} size="sm" />
                  <p className="min-w-0 flex-1 text-sm leading-6 text-muted">{levelMeta[row.level].description}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-purple-100 bg-purple-50/70 px-4 py-3 text-sm leading-6 text-primaryDark">
              被限制的用户仍然可以查看已有订单、处理群聊、查看物流、提交或修改未发货订单的收货地址，并查看信誉记录与提交申诉。
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">加分规则</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-muted">
              <li>• 车主完成一辆车的全部履约流程：<span className="font-bold text-success">+2 分</span>。</li>
              <li>• 车员正常完成一次拼车：<span className="font-bold text-success">+1 分</span>。</li>
              <li>• 同一车次同一用户只能获得一次对应奖励，重复操作不会重复加分。</li>
              <li>• 正常履约奖励每个自然月最多累计 <span className="font-bold text-ink">+{MONTHLY_REWARD_CAP} 分</span>。</li>
              <li>• 信誉分最高为 {REPUTATION_MAX} 分，达到上限后奖励仍然会记录，但不会超过上限。</li>
              <li>• 加分根据实际订单完成状态触发：车员需要确认收货，车主需要在所有车员确认收货后确认整车履约完成。</li>
            </ul>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">扣分规则</h2>
            <p className="mt-2 text-sm leading-7 text-muted">以下事件需要经过模拟平台管理员核实后才会扣分，投诉提交时不会立即扣分，同一违规事件只会扣分一次。</p>
            <div className="mt-4 divide-y divide-slate-100">
              {(Object.keys(complaintCategoryMeta) as ComplaintCategory[]).map((category) => {
                const meta = complaintCategoryMeta[category]
                return (
                  <div key={category} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-ink">{meta.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted">{meta.description}</span>
                    </span>
                    <span className="flex-none rounded-full bg-dangerSoft px-2.5 py-1 text-xs font-bold text-danger">
                      {meta.minDeduction === meta.maxDeduction
                        ? `-${meta.minDeduction} 分`
                        : `-${meta.minDeduction} ~ -${meta.maxDeduction} 分`}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">投诉与申诉流程</h2>
            <ol className="mt-4 space-y-3">
              {[
                '用户针对关联拼车提交投诉，投诉进入「待审核」状态，信誉分不会立即变化。',
                '模拟管理员查看投诉与违规事件，确认或驳回违规；确认违规才会生成独立扣分记录。',
                '用户可以在「我的信誉」中查看扣分原因、时间与关联车次，并提交申诉说明。',
                '模拟管理员审核申诉：通过则撤销对应扣分，驳回则保持扣分生效。',
                '系统重新计算信誉分与可用权限，并生成申诉结果通知。',
              ].map((text, index) => (
                <li key={text} className="flex gap-3">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-purple-50 text-xs font-black text-primary">{index + 1}</span>
                  <span className="text-sm leading-7 text-muted">{text}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="font-bold text-ink">快速入口</h2>
            <Button className="mt-4 w-full" onClick={() => navigate('/reputation')}>查看我的信誉</Button>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => navigate('/complaints')}>投诉与申诉</Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate(`/user/${currentUser.id}`)}>我的公开主页</Button>
          </Card>

          <Card className="border-slate-200 bg-slate-50/70 p-5">
            <h2 className="font-bold text-ink">演示说明</h2>
            <p className="mt-2 text-xs leading-6 text-muted">
              本规则为课程演示版本，信誉分与权限控制不代表真实平台的安全认证，也不会影响任何真实交易。
            </p>
          </Card>
        </aside>
      </div>
    </>
  )
}
