const ease = [0.22, 1, 0.36, 1] as const;

export const interactionMotion = {
  hover: { duration: 0.16, ease },
  press: { scale: 0.98 },
  fade: { hidden: { opacity: 0 }, visible: { opacity: 1 } },
  slide: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
  reveal: { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0 }, transition: { duration: 0.55, ease } },
  layout: { duration: 0.24, ease },
  modal: { hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.98 } },
  drawer: { hidden: { opacity: 0, x: 24 }, visible: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 24 } },
  toast: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 } },
} as const;
