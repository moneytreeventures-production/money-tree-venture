import { connection } from "next/server";
import Link from "next/link";
import { homepageReviews } from "@/lib/reviews";
import { logger } from "@/lib/logger";
export async function HomeReviews() {
  await connection();
  let items: Awaited<ReturnType<typeof homepageReviews>> = [];
  try { items = await homepageReviews(); }
  catch { logger.error("homepage.reviews.load_failed"); return null; }
  if (!items.length) return null;
  return <section className="mx-auto max-w-6xl px-5 py-16" aria-label="Customer reviews">
    <h2 className="text-3xl font-semibold">Customer reviews</h2>
    <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-5" tabIndex={0}>
      {items.map((review) => <article key={review.id} className="min-w-[min(85vw,320px)] snap-start rounded-2xl border border-border bg-surface p-5 sm:min-w-[320px]">
        <p aria-label={review.rating + " out of 5 stars"} className="text-amber-600">{"?".repeat(review.rating)}{"?".repeat(5-review.rating)}</p>
        <p className="mt-3 whitespace-pre-wrap break-words">{review.text}</p>
        <p className="mt-3 text-sm text-foreground-secondary">{review.displayName} * Verified Purchase</p>
        <Link href={"/products/" + encodeURIComponent(review.slug)} className="mt-3 inline-block text-sm font-semibold underline focus-visible:outline-2 focus-visible:outline-accent">{review.product}</Link>
      </article>)}
    </div>
    <p className="text-sm text-foreground-secondary">Swipe or scroll to read more reviews.</p>
  </section>;
}
