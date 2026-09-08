import {
  getDraftStatusClasses,
  getIntegrationStatusClasses,
  type DraftStatus,
  type IntegrationStatus,
} from '@/data/dashboard/mock-data'

type StatusBadgeProps =
  | { variant: 'draft'; status: DraftStatus }
  | { variant: 'integration'; status: IntegrationStatus }

export default function StatusBadge(props: StatusBadgeProps) {
  const classes =
    props.variant === 'draft'
      ? getDraftStatusClasses(props.status)
      : getIntegrationStatusClasses(props.status)

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${classes}`}
    >
      {props.status}
    </span>
  )
}
