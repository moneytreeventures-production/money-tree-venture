import { RatingStars } from "./rating-stars";

interface ReviewCardProps {
  review: { id: string; rating: number; title?: string; text: string; displayName: string; designation?: string; verifiedPurchase: boolean; createdAt?: string };
  productName?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ReviewCard({ review, productName, className = "", children }: ReviewCardProps) {
  return <article className={`mt-card mt-card-interactive flex h-full min-w-0 flex-col p-6 sm:p-7 ${className}`}>
    <RatingStars rating={review.rating} />
    {review.title && <h3 className="mt-5 text-lg font-semibold leading-snug text-foreground">{review.title}</h3>}
    <p className={`${review.title ? "mt-2" : "mt-5"} whitespace-pre-wrap break-words text-sm leading-7 text-foreground`}>{review.text}</p>
    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-5 text-xs text-foreground-secondary">
      <span className="grid gap-1"><span className="font-semibold text-foreground">{review.displayName}</span>{review.designation && <span>{review.designation}</span>}</span>
      {review.verifiedPurchase && <span className="rounded-full border border-border bg-surface-secondary px-2 py-1 font-medium">Verified purchase</span>}
      {review.createdAt && <time dateTime={review.createdAt}>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(review.createdAt))}</time>}
    </div>
    {productName && <p className="mt-3 break-words text-xs text-foreground-secondary">Review of {productName}</p>}
    {children}
  </article>;
}
