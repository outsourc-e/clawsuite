'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY_SEEN = 'clawsuite-mobile-setup-seen';

interface MobileSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSetupModal({ isOpen, onClose }: MobileSetupModalProps) {
  const [step, setStep] = useState(0);

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
      action: (
        <a
          href="https://tailscale.com/download"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Open Tailscale Downloads
        </a>
      ),
    },
    {
      title: 'Install Tailscale on your phone',
      body: 'Install Tailscale on iOS or Android and sign in with the same account.',
      action: (
        <div className="flex gap-2">
          <a
            href="https://apps.apple.com/app/apple-store/id425072860"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-700"
          >
            iOS App
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.tailscale.ipn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-700"
          >
            Android App
          </a>
        </div>
      ),
    },
    {
      title: 'Open ClawSuite on your phone',
      body: 'Use your desktop URL from your phone once both devices are on Tailscale.',
      action: (
        <p className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-xs text-blue-300 break-all">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold text-white">Mobile setup</h2>
        <p className="mb-4 text-xs text-gray-400">
          Step {step + 1} of {steps.length}
        </p>

        <h3 className="mb-2 text-sm font-medium text-gray-100">{currentStep.title}</h3>
        <p className="mb-4 text-sm text-gray-300">{currentStep.body}</p>
        <div className="mb-6">{currentStep.action}</div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0}
            className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
