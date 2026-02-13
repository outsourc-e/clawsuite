'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CloudIcon,
  CheckmarkCircle02Icon,
  Alert02Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { useGatewaySetupStore } from '@/hooks/use-gateway-setup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function GatewayStepContent() {
  const {
    gatewayUrl,
    gatewayToken,
    localGatewayDetected,
    testStatus,
    testError,
    setGatewayUrl,
    setGatewayToken,
    testConnection,
    saveGatewayAndProceed,
  } = useGatewaySetupStore()

  const handleTestAndSave = async () => {
    const success = await testConnection()
    if (success) {
      saveGatewayAndProceed()
    }
  }

  const canTest = gatewayUrl.trim().length > 0
  const canProceed = testStatus === 'success'

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-lg">
          <HugeiconsIcon icon={CloudIcon} className="size-10" strokeWidth={1.5} />
        </div>
        <h2 className="mb-3 text-2xl font-semibold text-primary-900">
          Connect to Gateway
        </h2>
        <p className="max-w-md text-base leading-relaxed text-primary-600">
          {localGatewayDetected
            ? 'We detected a local gateway running! Verify the connection below.'
            : 'Enter your OpenClaw Gateway URL and token to get started.'}
        </p>
      </div>

      <div className="space-y-4">
        {localGatewayDetected && (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={2}
            />
            <span>Local gateway detected at {gatewayUrl}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="gateway-url"
            className="mb-1.5 block text-sm font-medium text-primary-900"
          >
            Gateway URL
          </label>
          <Input
            id="gateway-url"
            type="url"
            placeholder="http://localhost:18789"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            className="h-10"
            autoFocus={!localGatewayDetected}
          />
        </div>

        <div>
          <label
            htmlFor="gateway-token"
            className="mb-1.5 block text-sm font-medium text-primary-900"
          >
            Gateway Token{' '}
            <span className="font-normal text-primary-500">(optional)</span>
          </label>
          <Input
            id="gateway-token"
            type="password"
            placeholder="Enter your gateway token..."
            value={gatewayToken}
            onChange={(e) => setGatewayToken(e.target.value)}
            className="h-10"
          />
          <p className="mt-1 text-xs text-primary-500">
            Leave blank if your gateway doesn't require authentication
          </p>
        </div>

        {testError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <HugeiconsIcon
              icon={Alert02Icon}
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={2}
            />
            <span>{testError}</span>
          </div>
        )}

        {testStatus === 'success' && (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={2}
            />
            <span>Connection successful! Ready to proceed.</span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={() => void testConnection()}
            disabled={!canTest || testStatus === 'testing'}
            className="flex-1"
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            variant="default"
            onClick={handleTestAndSave}
            disabled={!canProceed}
            className="flex-1 bg-accent-500 hover:bg-accent-600"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProviderStepContent() {
  const { skipProviderSetup, completeSetup } = useGatewaySetupStore()

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg">
          <HugeiconsIcon
            icon={Settings02Icon}
            className="size-10"
            strokeWidth={1.5}
          />
        </div>
        <h2 className="mb-3 text-2xl font-semibold text-primary-900">
          Configure Providers
        </h2>
        <p className="max-w-md text-base leading-relaxed text-primary-600">
          To use ClawSuite, you'll need to configure at least one AI provider
          (like OpenAI, Anthropic, or OpenRouter).
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-primary-900">
            How to configure providers:
          </h3>
          <ol className="space-y-2 text-sm text-primary-700">
            <li className="flex gap-2">
              <span className="font-semibold">1.</span>
              <span>
                Open your terminal and navigate to your OpenClaw directory
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">2.</span>
              <span>
                Run <code className="rounded bg-primary-100 px-1 py-0.5 text-xs">openclaw providers list</code>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">3.</span>
              <span>
                Add your API keys with{' '}
                <code className="rounded bg-primary-100 px-1 py-0.5 text-xs">
                  openclaw providers add
                </code>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">4.</span>
              <span>Return here and click "I'm Done" when ready</span>
            </li>
          </ol>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={skipProviderSetup}
            className="flex-1"
          >
            Skip for Now
          </Button>
          <Button
            variant="default"
            onClick={completeSetup}
            className="flex-1 bg-accent-500 hover:bg-accent-600"
          >
            I'm Done
          </Button>
        </div>

        <p className="text-center text-xs text-primary-500">
          You can configure providers later from the Settings menu
        </p>
      </div>
    </div>
  )
}

export function GatewaySetupWizard() {
  const { isOpen, step, initialize } = useGatewaySetupStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-[min(520px,92vw)] min-w-[320px] overflow-hidden rounded-2xl border border-primary-200 bg-primary-50 shadow-2xl"
          >
            {/* Background pattern */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent-500/5 via-transparent to-transparent" />

            {/* Content */}
            <div className="relative px-8 pb-8 pt-12">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {step === 'gateway' && <GatewayStepContent />}
                  {step === 'provider' && <ProviderStepContent />}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="border-t border-primary-200 bg-primary-100/50 px-6 py-3">
              <p className="text-center text-xs text-primary-500">
                Need help? Check the{' '}
                <a
                  href="https://docs.openclaw.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-600 underline hover:text-accent-700"
                >
                  documentation
                </a>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
