"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { interactionMotion } from "./motion-patterns";

const subscribe = () => () => undefined;

type RevealProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
} & Omit<ComponentProps<typeof motion.div>, "children" | "className">;

export default function Reveal({
  children,
  delay = 0,
  className,
  ...props
}: RevealProps) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const shouldReduceMotion = useReducedMotion();
  const reduceMotion = mounted && shouldReduceMotion;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.18 });

  return (
    <motion.div
      ref={ref}
      data-mt-reveal=""
      initial={false}
      animate={mounted && inView && !reduceMotion ? { y: [8, 0] } : { y: 0 }}
      transition={{ ...interactionMotion.reveal.transition, duration: reduceMotion ? 0 : interactionMotion.reveal.transition.duration, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
