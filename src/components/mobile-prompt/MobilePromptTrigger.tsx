'use client';

import { useEffect, useRef, useState } from 'react';
import { MobileSetupModal } from './MobileSetupModal';

export function MobilePromptTrigger() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const mountTimeRef = useRef<number | null>(null);

  useEffect(() => {
    mountTimeRef.current = Date.now();

    // ?mobile-preview forces modal open immediately (dev/review only)
    if (new URLSearchParams(window.location.search).get('mobile-preview') === '1') {
      setIsModalOpen(true);
      return;
    }

    const isDismissed = localStorage.getItem('clawsuite-mobile-prompt-dismissed') === 'true';
    const isSetup = localStorage.getItem('clawsuite-mobile-setup-seen') === 'true';

    if (isDismissed || isSetup) {
      return;
    }

    const checkPrompt = () => {
      if (!mountTimeRef.current) {
        return;
      }

      const elapsedTime = Date.now() - mountTimeRef.current;
      const isDesktop = window.innerWidth > 768;
      const hasBeenOnPageLongEnough = elapsedTime >= 45_000;

      if (isDesktop && hasBeenOnPageLongEnough) {
        setShowPrompt(true);
      }
    };

    checkPrompt();
    const interval = window.setInterval(checkPrompt, 5_000);
    return () => window.clearInterval(interval);
  }, []);

  const dismissPrompt = () => {
    localStorage.setItem('clawsuite-mobile-prompt-dismissed', 'true');
    setShowPrompt(false);
  };

  const openSetup = () => {
    setShowPrompt(false);
    setIsModalOpen(true);
  };

  const closeSetup = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      {showPrompt ? (
        <div className="fixed bottom-4 right-4 z-40 max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-4 shadow-xl">
          <p className="mb-1 text-sm font-medium text-white">Set up mobile access</p>
          <p className="mb-3 text-xs text-gray-300">
            Connect your phone to this ClawSuite instance in a few steps.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={dismissPrompt}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={openSetup}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Start setup
            </button>
          </div>
        </div>
      ) : null}

      <MobileSetupModal isOpen={isModalOpen} onClose={closeSetup} />
    </>
  );
}
