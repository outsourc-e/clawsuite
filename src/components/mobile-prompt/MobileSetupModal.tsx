'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Copy01Icon, Tick01Icon } from '@hugeicons/core-free-icons';

const STORAGE_KEY_SEEN = 'clawsuite-mobile-setup-seen';

interface MobileSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function TailscaleIcon() {
  return (
    <svg viewBox="0 0 100 100" className="size-5">
      <circle cx="50" cy="10" r="10" fill="#fff" opacity="0.9" />
      <circle cx="50" cy="50" r="10" fill="#fff" />
      <circle cx="50" cy="90" r="10" fill="#fff" opacity="0.9" />
      <circle cx="10" cy="30" r="10" fill="#fff" opacity="0.6" />
      <circle cx="90" cy="30" r="10" fill="#fff" opacity="0.6" />
      <circle cx="10" cy="70" r="10" fill="#fff" opacity="0.6" />
      <circle cx="90" cy="70" r="10" fill="#fff" opacity="0.6" />
      <circle cx="10" cy="50" r="10" fill="#fff" opacity="0.3" />
      <circle cx="90" cy="50" r="10" fill="#fff" opacity="0.3" />
    </svg>
  );
}

export function MobileSetupModal({ isOpen, onClose }: MobileSetupModalProps) {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const copyExpose = () => {
    navigator.clipboard.writeText('Expose yourself on the network so I can access you from my phone').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setStep(0);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const steps = [
    {
      title: 'Install Tailscale on your desktop',
      body: 'Install Tailscale on the machine running ClawSuite, then sign in.',
      showTailscaleIcon: true,
      action: (
        <a
          href="https://tailscale.com/download"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          Open Tailscale Downloads
        </a>
      ),
    },
    {
      title: 'Make OpenClaw discoverable',
      body: 'Send this command to your OpenClaw to expose it on the network so your phone can reach it.',
      showTailscaleIcon: false,
      action: (
        <button
          type="button"
          onClick={copyExpose}
          className="group flex w-full items-center justify-between rounded-lg border border-primary-700 bg-primary-950 px-4 py-3 text-left transition-colors hover:border-accent-500/50"
        >
          <span className="font-mono text-xs text-accent-300">
            Expose yourself on the network so I can access you from my phone
          </span>
          <span className="ml-3 shrink-0 text-primary-400 group-hover:text-accent-400">
            <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={16} strokeWidth={2} className={copied ? 'text-green-400' : ''} />
          </span>
        </button>
      ),
    },
    {
      title: 'Install Tailscale on your phone',
      body: 'Install Tailscale on iOS or Android and sign in with the same account.',
      showTailscaleIcon: true,
      action: (
        <div className="flex gap-2">
          <a
            href="https://apps.apple.com/app/apple-store/id425072860"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-primary-700 bg-primary-950 px-3 py-2 text-xs font-medium text-primary-100 transition-colors hover:bg-primary-800"
          >
            iOS App
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.tailscale.ipn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-primary-700 bg-primary-950 px-3 py-2 text-xs font-medium text-primary-100 transition-colors hover:bg-primary-800"
          >
            Android App
          </a>
        </div>
      ),
    },
    {
      title: 'Open ClawSuite on your phone',
      body: 'Use your desktop URL from your phone once both devices are on Tailscale.',
      showTailscaleIcon: false,
      action: (
        <p className="break-all rounded-lg border border-primary-700 bg-primary-950 px-3 py-2 font-mono text-xs text-accent-300">
          {typeof window === 'undefined' ? '' : window.location.origin}
        </p>
      ),
    },
  ];

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  const handleNext = () => {
    if (!isLastStep) {
      setStep((prev) => prev + 1);
      return;
    }

    localStorage.setItem(STORAGE_KEY_SEEN, 'true');
    localStorage.setItem('clawsuite-mobile-prompt-dismissed', 'true');
    onClose();
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        className="relative w-full max-w-md rounded-2xl border border-primary-800/60 bg-primary-950 p-5 text-white shadow-2xl shadow-black/40"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-primary-400 transition-colors hover:bg-primary-900 hover:text-primary-200"
          aria-label="Close mobile setup"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
        </button>

        <div className="mb-4 flex items-center gap-3 pr-10">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent-500 shadow-lg shadow-accent-500/20">
            <img src="/logo-final.svg" className="size-6" alt="ClawSuite" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">Mobile Setup</h2>
            <div className="mt-1 flex items-center gap-1.5">
              {steps.map((_, index) => (
                <span
                  key={`step-indicator-${index}`}
                  className={`h-2 w-6 rounded-full transition-colors ${
                    index === step ? 'bg-accent-500' : 'bg-primary-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-primary-900 p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-2 flex items-center gap-2">
                {currentStep.showTailscaleIcon ? <TailscaleIcon /> : null}
                <h3 className="text-sm font-semibold text-primary-100">{currentStep.title}</h3>
              </div>
              <p className="mb-4 text-sm text-primary-300">{currentStep.body}</p>
              <div>{currentStep.action}</div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0}
            className="rounded-lg px-3 py-2 text-sm text-primary-400 transition-colors hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-primary-400 transition-colors hover:text-primary-200"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
