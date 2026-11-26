"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-hydrated-reduced-motion";

/** One scroll controller for decorative spots across the complete homepage. */
export default function HomeScrollGlow() {
  const reducedMotion = useHydratedReducedMotion();
  const { scrollYProgress } = useScroll();
  const warmY = useTransform(scrollYProgress, [0, 1], [0, 130]);
  const coolY = useTransform(scrollYProgress, [0, 1], [0, -105]);

  return <div data-home-glow aria-hidden="true" className="mt-home-glow" style={{ position: "fixed", inset: 0 }}>
    {[0, 1].map(index => <motion.div key={`warm-${index}`} data-scroll-warm className={`mt-home-glow__spot mt-home-glow__warm-${index}`} style={{ y: reducedMotion ? 0 : warmY }}><span className="mt-ambient__warm" /></motion.div>)}
    {[0, 1].map(index => <motion.div key={`cool-${index}`} data-scroll-cool className={`mt-home-glow__spot mt-home-glow__cool-${index}`} style={{ y: reducedMotion ? 0 : coolY }}><span className="mt-ambient__cool" /></motion.div>)}
  </div>;
}
