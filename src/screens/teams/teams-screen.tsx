import { Rocket01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function TeamsScreen() {
  const navigate = useNavigate()

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-500">
              <HugeiconsIcon icon={UserGroupIcon} size={24} strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-primary-900">Teams</h1>
              <p className="mt-1 text-sm text-primary-600">
                Workspace team approvals were removed during the cleanup.
              </p>
            </div>
          </div>
          <Button
            className="bg-accent-500 text-primary-950 hover:bg-accent-400"
            onClick={() => void navigate({ to: '/conductor' })}
          >
            <HugeiconsIcon icon={Rocket01Icon} size={16} strokeWidth={1.8} />
            Open Conductor
          </Button>
        </header>

        <section className="rounded-xl border border-primary-200 bg-white p-6 shadow-sm">
          <p className="max-w-2xl text-sm text-primary-600">
            Team orchestration now lives in the gateway mission flow. This placeholder keeps the
            screen importable without depending on deleted workspace routes or types.
          </p>
        </section>
      </section>
    </main>
  )
}
