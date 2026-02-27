'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { MobileSetupModal } from './MobileSetupModal';
import { OpenClawStudioIcon } from '@/components/icons/clawsuite';

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
      <AnimatePresence>
        {showPrompt ? (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="fixed top-4 left-1/2 z-[9999] w-[90vw] max-w-md -translate-x-1/2 overflow-hidden rounded-2xl border border-primary-800/60 bg-primary-950 text-white shadow-2xl shadow-black/40"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex shrink-0 items-center gap-2">
                <OpenClawStudioIcon className="size-8 overflow-hidden rounded-lg" />
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
              </div>

              <div className="min-w-0 flex-1 text-center">
                <p className="text-sm font-semibold text-white">Set up mobile access</p>
                <p className="text-xs text-primary-300">
                  Connect your phone to this ClawSuite instance in a few steps.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={openSetup}
                  className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-400"
                >
                  Set up
                </button>
                <button
                  type="button"
                  onClick={dismissPrompt}
                  className="rounded-lg p-1.5 text-primary-300 transition-colors hover:bg-primary-900 hover:text-white"
                  aria-label="Dismiss mobile setup prompt"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <MobileSetupModal isOpen={isModalOpen} onClose={closeSetup} />
    </>
  );
}
