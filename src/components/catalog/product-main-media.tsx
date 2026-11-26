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

type ProductMainMediaProps = {
  name: string;
  thumbnailRef?: string;
  imageRefs?: string[];
  promotionalVideoUrl?: string;
  videoUnavailableMessage?: string;
  previewUnavailableMessage?: string;
};

export function ProductMainMedia({ name, thumbnailRef, imageRefs, promotionalVideoUrl, videoUnavailableMessage = "The video could not be played. The product thumbnail is shown instead.", previewUnavailableMessage = "Product preview is currently unavailable." }: ProductMainMediaProps) {
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [videoSelected, setVideoSelected] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const images = [...new Set((imageRefs?.length ? imageRefs : [thumbnailRef]).map((reference) => safeMediaSource(reference)).filter((source): source is string => Boolean(source)))].slice(0, 8);
  const currentImage = selectedImage && images.includes(selectedImage) ? selectedImage : images[0];
  const video = safeMediaSource(promotionalVideoUrl);
  const showVideo = Boolean(video && !videoUnavailable && videoSelected);
  const showGallery = images.length > 1 || Boolean(video && imageRefs?.length);

  return <div className="min-w-0">
    <div className={`mt-card relative aspect-[4/3] overflow-hidden rounded-3xl sm:aspect-[1.3/1] ${showVideo ? "bg-[#0f1e36]" : "bg-surface-secondary"}`}>
      {showVideo ? <video src={video} controls preload="none" playsInline poster={images[0]} aria-label={`${name} promotional video`} onError={() => { setVideoUnavailable(true); setVideoSelected(false); }} className="size-full object-contain" />
        : currentImage && failedImage !== currentImage ? <Image key={currentImage} src={currentImage} alt={`${name} product image`} fill sizes="(max-width: 1024px) 100vw, 50vw" unoptimized className="object-contain transition-opacity duration-200" onError={() => setFailedImage(currentImage)} />
          : <div className="grid size-full place-items-center bg-[linear-gradient(135deg,#e8edf3,#f4e4d8)]"><span className="grid size-20 place-items-center rounded-3xl border border-[#0f1e36]/10 bg-white/80 text-4xl font-semibold text-[#0f1e36]">{name.slice(0, 1).toUpperCase()}</span></div>}
      {videoUnavailable && <p className="absolute inset-x-4 bottom-4 rounded-xl bg-background/90 px-4 py-3 text-sm text-foreground-secondary" role="status">{videoUnavailableMessage}</p>}
      {!showVideo && (!currentImage || failedImage === currentImage) && !videoUnavailable && <p className="absolute inset-x-4 bottom-4 rounded-xl bg-background/90 px-4 py-3 text-sm text-foreground-secondary">{previewUnavailableMessage}</p>}
    </div>
    {showGallery && <div role="group" aria-label={`${name} media choices`} className="mt-3 flex flex-wrap gap-2">
      {video && !videoUnavailable && <button type="button" onClick={() => setVideoSelected(true)} aria-pressed={showVideo} className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-xs font-semibold text-foreground transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent">Video</button>}
      {images.map((source, index) => <button key={source} type="button" onClick={() => { setSelectedImage(source); setVideoSelected(false); }} aria-label={`Show image ${index + 1} of ${images.length} for ${name}`} aria-pressed={!showVideo && currentImage === source} className={`relative size-12 overflow-hidden rounded-xl border bg-surface focus-visible:outline-2 focus-visible:outline-accent ${!showVideo && currentImage === source ? "border-accent" : "border-border hover:border-accent"}`}><Image src={source} alt="" fill sizes="48px" unoptimized className="object-cover" /></button>)}
    </div>}
  </div>;
}
