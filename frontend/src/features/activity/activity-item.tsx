import { type Activity } from '../../api'
import { cn } from '../../shared/lib/cn'
import { activityIcon, activityToneClass, formatActivityTime } from '../../shared/lib/format'

type ActivityItemProps = {
  activity: Activity
  detailed?: boolean
}

export function ActivityItem({ activity, detailed = false }: ActivityItemProps) {
  const Icon = activityIcon(activity.kind)
  const iconSize = detailed ? 'size-8' : 'size-6'
  const glyphSize = detailed ? 'size-4' : 'size-3.5'

  return (
    <div
      className={cn('flex items-center gap-3 border-b last:border-b-0', detailed ? 'py-4' : 'py-3')}
    >
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-full',
          iconSize,
          activityToneClass(activity.tone),
        )}
      >
        <Icon className={glyphSize} />
      </span>
      <span className={cn('min-w-0 flex-1 text-sm', !detailed && 'truncate')}>
        {activity.message}
      </span>
      <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatActivityTime(activity.createdAt, detailed)}
      </time>
    </div>
  )
}
