"use client";

import { useRef, type PointerEvent } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useHydratedReducedMotion } from "@/lib/use-hydrated-reduced-motion";
import GrowthEcosystem from "./growth-ecosystem";

/** Motion values keep pointer and scroll movement outside React render cycles. */
export default function HeroDepth() {
  const frame = useRef<HTMLDivElement>(null);
  const reducedMotion = useHydratedReducedMotion();
  const { scrollYProgress } = useScroll({ target: frame, offset: ["start end", "end start"] });
  const rearY = useTransform(scrollYProgress, [0, 1], [-38, 52]);
  const frontY = useTransform(scrollYProgress, [0, 1], [18, -30]);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(pointerX, { stiffness: 130, damping: 24 });
  const rotateX = useSpring(pointerY, { stiffness: 130, damping: 24 });

  function move(event: PointerEvent<HTMLDivElement>) {
    if (reducedMotion || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - rect.left) / rect.width - 0.5) * 7);
    pointerY.set((0.5 - (event.clientY - rect.top) / rect.height) * 7);
  }

  return <div ref={frame} data-hero-depth className="relative mx-auto w-full min-w-0 max-w-[640px] lg:ml-auto" style={{ perspective: 1100 }} onPointerMove={move} onPointerLeave={() => { pointerX.set(0); pointerY.set(0); }}>
    <motion.div data-parallax-rear aria-hidden="true" className="pointer-events-none absolute -inset-5 rounded-[2.5rem] border border-accent/25 bg-[radial-gradient(circle_at_80%_20%,rgba(249,115,22,0.14),transparent_55%)]" style={{ y: reducedMotion ? 0 : rearY }} />
    <motion.div data-parallax-front className="relative" style={{ y: reducedMotion ? 0 : frontY, rotateX: reducedMotion ? 0 : rotateX, rotateY: reducedMotion ? 0 : rotateY }}><GrowthEcosystem /></motion.div>
  </div>;
}
