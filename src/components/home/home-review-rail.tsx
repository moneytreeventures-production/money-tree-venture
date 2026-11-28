"use client";

import { useState } from "react";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { useHydratedReducedMotion } from "@/lib/use-hydrated-reduced-motion";
import { ReviewCard } from "@/components/reviews/review-card";

interface HomeReview {
  id: string; rating: number; text: string; displayName: string; designation?: string;
  verifiedPurchase?: boolean; product: string; slug: string; createdAt?: string;
}

export function HomeReviewRail({ items, demonstration = false }: { items: HomeReview[]; demonstration?: boolean }) {
  const [manualPaused, setManualPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const reducedMotion = useHydratedReducedMotion();
  const multiple = items.length > 1;
  const playing = multiple && !manualPaused && !interactionPaused && !reducedMotion;

  function cards(decorative: boolean) {
    return items.map((review) => <ReviewCard key={`${decorative ? "copy" : "original"}-${review.id}`} review={{ ...review, verifiedPurchase: review.verifiedPurchase === true }} className={multiple ? "mt-review-marquee-card shrink-0" : ""}>
      {demonstration ? <span tabIndex={decorative ? -1 : 0} className="mt-4 text-xs font-semibold text-foreground-secondary focus-visible:outline-2 focus-visible:outline-accent">Local demonstration only</span> : <Link href={`/products/${encodeURIComponent(review.slug)}`} tabIndex={decorative ? -1 : undefined} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">View {review.product}</Link>}
    </ReviewCard>);
  }

  if (!multiple) return <div className="mx-auto mt-8 max-w-2xl">{cards(false)}</div>;

  return <>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-foreground-secondary">{demonstration ? "Local sample content, not customer feedback." : "Customer perspectives, at your pace."}</p><button type="button" disabled={Boolean(reducedMotion)} onClick={() => setManualPaused((value) => !value)} aria-label={reducedMotion ? "Motion disabled by reduced-motion preference" : manualPaused ? "Play testimonials" : "Pause testimonials"} aria-pressed={manualPaused} aria-controls="customer-review-rail" className="mt-button inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60">{manualPaused || reducedMotion ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{reducedMotion ? "Motion off" : manualPaused ? "Play" : "Pause"}</button></div>
    <div id="customer-review-rail" data-review-marquee className="mt-review-marquee-viewport mt-5 overflow-hidden"
      onMouseEnter={() => setInteractionPaused(true)} onMouseLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteractionPaused(false); }}
      onTouchStart={() => setInteractionPaused(true)} onTouchEnd={() => setInteractionPaused(false)} onTouchCancel={() => setInteractionPaused(false)}>
      <div className="mt-review-marquee-track flex w-max" data-playing={playing} style={{ animationPlayState: playing ? "running" : "paused" }}>
        <div className="mt-review-marquee-group flex shrink-0 gap-4 pr-4">{cards(false)}</div>
        <div className="mt-review-marquee-group flex shrink-0 gap-4 pr-4" aria-hidden="true" inert>{cards(true)}</div>
      </div>
    </div>
    <p className="sr-only">Use the Play or Pause button to control the moving reviews. Hovering or focusing a review pauses movement temporarily.</p>
  </>;
}
