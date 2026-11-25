"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { activateOverlay } from "./overlay-controller";
import { interactionMotion } from "./motion-patterns";

const subscribe = () => () => undefined;

export function AccessibleOverlay({ open, onClose, titleId, descriptionId, variant = "dialog", children, className = "" }: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  variant?: "dialog" | "drawer";
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = mounted && prefersReducedMotion;
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !panelRef.current) return;
    return activateOverlay(panelRef.current, () => closeRef.current());
  }, [open]);

  const panelMotion = variant === "drawer" ? interactionMotion.drawer : interactionMotion.modal;
  const panelClass = variant === "drawer"
    ? "ml-auto h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl sm:p-8"
    : "mx-auto my-3 w-full max-w-4xl rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:my-8 sm:p-8";

  return <AnimatePresence>
    {open && <motion.div key="overlay" className="fixed inset-0 z-[var(--layer-dialog)] overflow-y-auto bg-black/50 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }}>
      <motion.section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} className={`${panelClass} ${className}`} initial={panelMotion.hidden} animate={panelMotion.visible} exit={panelMotion.exit} transition={{ ...interactionMotion.layout, duration: reducedMotion ? 0 : 0.2 }}>
        {children}
      </motion.section>
    </motion.div>}
  </AnimatePresence>;
}
