import { Star } from "lucide-react";

export function RatingStars({ rating, size = 18 }: { rating: number; size?: number }) {
  const whole = Number.isInteger(rating) ? Math.max(0, Math.min(5, rating)) : 0;
  return <span role="img" aria-label={`${whole} out of 5 stars`} className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
    {Array.from({ length: 5 }, (_, index) => <Star key={index} size={size} fill={index < whole ? "currentColor" : "none"} strokeWidth={1.8} aria-hidden="true" />)}
  </span>;
}
