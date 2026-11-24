import { publicReviews } from "@/lib/reviews";
import { ReviewForm } from "./review-form";
export async function ProductReviews({ productId }: { productId: string }) {
  const reviews = await publicReviews(productId);
  return <section className="mx-auto max-w-6xl px-5 py-12">
    <h2 className="text-2xl font-semibold">Customer reviews</h2>
    <p>{reviews.count ? reviews.average + " out of 5 from " + reviews.count + " reviews" : "No customer reviews yet."}</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{reviews.items.map((r) => <article key={r.id} className="rounded-xl border border-border p-5">
      <p aria-label={r.rating + " out of 5 stars"} className="text-amber-600">{"?".repeat(r.rating)}{"?".repeat(5-r.rating)}</p>
      <h3 className="font-semibold">{r.title}</h3><p className="whitespace-pre-wrap break-words">{r.text}</p>
      <p className="mt-3 text-sm text-foreground-secondary">{r.displayName}{r.verifiedPurchase && " * Verified Purchase"}{r.createdAt && " * " + new Date(r.createdAt).toLocaleDateString("en-IN")}</p>
    </article>)}</div>
    <ReviewForm productId={productId} />
  </section>;
}
