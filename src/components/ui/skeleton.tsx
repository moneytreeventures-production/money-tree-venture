import type { ReactNode } from "react";

function LoadingRegion({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <div role="status" className={className}><span className="sr-only">{label}</span><div aria-hidden="true">{children}</div></div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`mt-skeleton rounded-lg ${className}`} />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return <div className="grid gap-3">{Array.from({ length: lines }, (_, index) => <Skeleton key={index} className={`h-4 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />)}</div>;
}

export function SkeletonMedia({ aspect = "catalogue" }: { aspect?: "catalogue" | "featured" }) {
  return <Skeleton className={`${aspect === "featured" ? "aspect-[4/3]" : "aspect-[1.55/1]"} w-full rounded-none`} />;
}

export function SkeletonProductCard({ mediaAspect = "catalogue" }: { mediaAspect?: "catalogue" | "featured" }) {
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface"><SkeletonMedia aspect={mediaAspect} /><div className="grid gap-5 p-5"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-4/5" /><SkeletonText lines={2} /><Skeleton className="h-6 w-28" /><Skeleton className="h-11 w-full rounded-full" /></div></article>;
}

export function SkeletonProductGrid({ label = "Loading products...", count = 3, className = "", announce = true, mediaAspect = "catalogue" }: { label?: string; count?: number; className?: string; announce?: boolean; mediaAspect?: "catalogue" | "featured" }) {
  const grid = <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: count }, (_, index) => <SkeletonProductCard key={index} mediaAspect={mediaAspect} />)}</div>;
  return announce ? <LoadingRegion label={label} className={className}>{grid}</LoadingRegion> : <div aria-hidden="true" className={className}>{grid}</div>;
}

export function FeaturedProductsSkeleton() {
  return <section id="featured" className="scroll-mt-20 bg-surface px-5 py-16 sm:px-8"><div className="mx-auto max-w-6xl"><LoadingRegion label="Loading featured products..."><Skeleton className="h-9 w-64 max-w-full" /><Skeleton className="mt-3 h-5 w-96 max-w-full" /><div className="mt-8"><SkeletonProductGrid count={3} announce={false} mediaAspect="featured" /></div></LoadingRegion></div></section>;
}

export function CatalogueSkeleton() {
  return <div className="mt-container py-10 sm:py-14"><LoadingRegion label="Loading catalogue..."><Skeleton className="h-11 w-72 max-w-full" /><Skeleton className="mt-4 h-5 w-96 max-w-full" /><Skeleton className="mt-8 h-32 w-full rounded-2xl" /><div className="mt-8"><SkeletonProductGrid count={6} announce={false} /></div></LoadingRegion></div>;
}

export function SkeletonCartSummary() {
  return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14"><LoadingRegion label="Loading your cart..."><Skeleton className="h-10 w-48" /><div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]"><div className="grid gap-4">{[0, 1].map((index) => <div key={index} className="flex gap-4 rounded-2xl border border-border bg-surface p-5"><Skeleton className="size-20 shrink-0" /><div className="w-full"><Skeleton className="h-6 w-3/4" /><Skeleton className="mt-4 h-4 w-1/2" /></div></div>)}</div><div className="h-fit rounded-2xl border border-border bg-surface p-5"><SkeletonText lines={3} /><Skeleton className="mt-6 h-11 w-full rounded-full" /></div></div></LoadingRegion></main>;
}

export function SkeletonCheckoutSummary() {
  return <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16"><LoadingRegion label="Preparing checkout..."><Skeleton className="h-9 w-64 max-w-full" /><Skeleton className="mt-4 h-5 w-full max-w-lg" /><div className="mt-9 rounded-2xl border border-border bg-surface p-6"><SkeletonText lines={4} /><Skeleton className="mt-8 h-11 w-full rounded-full" /></div></LoadingRegion></main>;
}

export function SkeletonAccountContent({ label = "Loading your account..." }: { label?: string }) {
  return <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14"><LoadingRegion label={label}><Skeleton className="h-10 w-64 max-w-full" /><Skeleton className="mt-3 h-5 w-96 max-w-full" /><div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((index) => <div key={index} className="rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-2/3" /><Skeleton className="mt-5 h-9 w-16" /><Skeleton className="mt-4 h-4 w-1/2" /></div>)}</div><Skeleton className="mt-10 h-40 w-full rounded-2xl" /></LoadingRegion></main>;
}

export function SkeletonDataTable({ label = "Loading products...", rows = 3 }: { label?: string; rows?: number }) {
  return <LoadingRegion label={label} className="w-full"><div className="grid gap-3 p-5">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex min-h-16 items-center gap-4 border-b border-border pb-3 last:border-0"><Skeleton className="size-12 shrink-0" /><Skeleton className="h-5 w-1/3" /><Skeleton className="ml-auto h-5 w-20" /></div>)}</div></LoadingRegion>;
}
