import { publicReviews } from "@/lib/reviews";
import { ReviewForm } from "./review-form";
import { ReviewCard } from "@/components/reviews/review-card";
import { logger } from "@/lib/logger";

export async function ProductReviews({ productId, productName }: { productId: string; productName: string }) {
  let reviews: Awaited<ReturnType<typeof publicReviews>>;
  try { reviews = await publicReviews(productId); }
  catch {
    logger.error("product.reviews.load_failed");
    return <section className="mt-container max-w-6xl border-t border-border py-12" aria-label="Customer reviews"><h2 className="text-2xl font-semibold">Customer reviews</h2><p role="status" className="mt-4 text-sm text-foreground-secondary">Reviews are temporarily unavailable. Please try again later.</p></section>;
  }
  return <section className="mt-container max-w-6xl border-t border-border py-12 sm:py-16">
    <p className="mt-eyebrow">Customer perspectives</p>
    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Customer reviews</h2>
    <p className="mt-2 text-sm text-foreground-secondary">{reviews.count ? `${reviews.average} out of 5 from ${reviews.count} ${reviews.count === 1 ? "review" : "reviews"}` : "No reviews yet"}</p>
    {reviews.count === 0 ? <p className="mt-6 max-w-2xl rounded-2xl border border-dashed border-border bg-surface p-6 text-sm leading-6 text-foreground-secondary">There are no published customer reviews for this product yet. Verified purchasers can share their experience below.</p> :
      <div className={`mt-6 grid gap-4 ${reviews.items.length === 1 ? "max-w-2xl" : "sm:grid-cols-2"}`}>{reviews.items.map((review) => <ReviewCard key={review.id} review={review} productName={productName} />)}</div>}
    <ReviewForm productId={productId} />
  </section>;
}
