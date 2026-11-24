"use client";

import Image from "next/image";
import { useState } from "react";

function safeMediaSource(reference?: string): string | undefined {
  if (!reference) return undefined;
  if (reference.startsWith("/") && !reference.startsWith("//") && !reference.includes("\\")) return reference;
  try {
    const url = new URL(reference);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function ProductMainMedia({ name, thumbnailRef, promotionalVideoUrl, videoUnavailableMessage = "The video could not be played. The product thumbnail is shown instead.", previewUnavailableMessage = "Product preview is currently unavailable." }: { name: string; thumbnailRef?: string; promotionalVideoUrl?: string; videoUnavailableMessage?: string; previewUnavailableMessage?: string }) {
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const thumbnail = safeMediaSource(thumbnailRef);
  const video = safeMediaSource(promotionalVideoUrl);

  if (video && !videoUnavailable) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-[#0f1e36] shadow-[0_28px_70px_-45px_rgba(15,30,54,0.55)] sm:aspect-[1.3/1]">
        <video
          src={video}
          controls
          preload="none"
          playsInline
          poster={thumbnail}
          aria-label={`${name} promotional video`}
          onError={() => setVideoUnavailable(true)}
          className="size-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-surface-secondary shadow-[0_28px_70px_-45px_rgba(15,30,54,0.35)] sm:aspect-[1.3/1]">
      {thumbnail ? <Image src={thumbnail} alt={`${name} product thumbnail`} fill sizes="(max-width: 1024px) 100vw, 50vw" unoptimized className="object-cover" /> : <div className="grid size-full place-items-center bg-[linear-gradient(135deg,#e8edf3,#f4e4d8)]"><span className="grid size-20 place-items-center rounded-3xl border border-[#0f1e36]/10 bg-white/80 text-4xl font-semibold text-[#0f1e36]">{name.slice(0, 1).toUpperCase()}</span></div>}
      {videoUnavailable && <p className="absolute inset-x-4 bottom-4 rounded-xl bg-background/90 px-4 py-3 text-sm text-foreground-secondary" role="status">{videoUnavailableMessage}</p>}
      {!thumbnail && !videoUnavailable && <p className="absolute inset-x-4 bottom-4 rounded-xl bg-background/90 px-4 py-3 text-sm text-foreground-secondary">{previewUnavailableMessage}</p>}
    </div>
  );
}
