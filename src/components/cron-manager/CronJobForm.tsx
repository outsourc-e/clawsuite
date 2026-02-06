import { Button } from '@/components/ui/button'

type CronJobFormProps = {
  onClose?: () => void
}

export function CronJobForm({ onClose }: CronJobFormProps) {
  return (
    <section className="rounded-2xl border border-dashed border-primary-300 bg-primary-50/65 p-4 backdrop-blur-xl">
      <h3 className="text-base font-medium text-ink text-balance">Create / Edit Job</h3>
      <p className="mt-1 text-sm text-primary-600 text-pretty">
        Phase 2 focuses on visibility and operations. Form editing is scaffolded for the
        next phase.
      </p>
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={function onClickClose() {
            onClose?.()
          }}
        >
          Close
        </Button>
      </div>
    </section>
  )
}
