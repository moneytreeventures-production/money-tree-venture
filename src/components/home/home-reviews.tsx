import { connection } from "next/server";
import { homepageReviews } from "@/lib/reviews";
import { logger } from "@/lib/logger";
import { HomeReviewRail } from "./home-review-rail";
export async function HomeReviews() {
  await connection();
  let items: Awaited<ReturnType<typeof homepageReviews>> = [];
  let unavailable = false;
  try { items = await homepageReviews(); }
  catch { logger.error("homepage.reviews.load_failed"); unavailable = true; }
  return <section className="bg-surface py-16 sm:py-22" aria-label="Customer reviews">
    <div className="mt-container">
    <p className="mt-eyebrow">From customers</p>
    <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">Stories from verified customers.</h2>
    <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-secondary">Read experiences shared by customers who purchased a MoneyTreeVentures resource.</p>
    {unavailable ? <p role="status" className="mt-8 max-w-2xl rounded-2xl border border-dashed border-border p-6 text-sm text-foreground-secondary">Customer reviews are temporarily unavailable. Please check back later.</p> : items.length ? <HomeReviewRail items={items} /> : <p className="mt-8 max-w-2xl rounded-2xl border border-dashed border-border p-6 text-sm text-foreground-secondary">No published customer reviews yet. Explore our resources and check back for customer perspectives.</p>}
    </div>
  </section>;
}
