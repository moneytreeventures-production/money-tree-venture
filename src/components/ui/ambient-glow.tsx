type AmbientGlowProps = { variant?: "hero" | "soft" | "quiet" };

/** Decorative CSS-only atmosphere. The containing surface provides clipping. */
export function AmbientGlow({ variant = "soft" }: AmbientGlowProps) {
  return <div aria-hidden="true" className={`mt-ambient mt-ambient--${variant}`}>
    <span className="mt-ambient__warm" />
    <span className="mt-ambient__cool" />
  </div>;
}
