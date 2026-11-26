import Link from "next/link";
import { connection } from "next/server";
import { listPublicProducts } from "@/lib/catalog/product-service";
import { logger } from "@/lib/logger";
import { formatINR } from "@/lib/format/currency";
import { ProductMainMedia } from "@/components/catalog/product-main-media";
import { ProductPurchaseAction } from "@/components/catalog/product-purchase-action";
import Reveal from "@/components/ui/reveal";

export default async function FeaturedProducts() {
  await connection();
  let result: Awaited<ReturnType<typeof listPublicProducts>> | undefined;
  try {
    result = await listPublicProducts({ page: 1, pageSize: 6, sort: "featured" });
  } catch {
    logger.error("homepage.products.load_failed");
  }
  return <section id="featured" className="scroll-mt-20 bg-surface py-18 sm:py-24">
    <div className="mt-container">
      <Reveal><p className="mt-eyebrow">Find your next resource</p>
      <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end md:gap-10">
        <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">Explore our resources</h2>
        <p className="max-w-lg text-sm leading-7 text-foreground-secondary sm:text-base">PDF guides, bundles and separate 1:1 Call Guidance. Check each product for details.</p>
      </div></Reveal>
      {!result && <p className="mt-8" role="status">Products are temporarily unavailable. Please try again shortly.</p>}
      {result?.items.length === 0 && <p className="mt-8">There are no published products available yet. Please check back soon.</p>}
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {result?.items.map((product) => <article key={String(product._id)} className="mt-card mt-card-interactive min-w-0 overflow-hidden bg-background">
          <ProductMainMedia name={product.name} thumbnailRef={product.imageRefs?.[0]} />
          <div className="grid gap-4 p-5">
            <p className="text-xs font-semibold text-accent-foreground">{product.productType === "pdf" ? "PDF guide" : product.productType === "call_guidance" ? "1:1 Call Guidance" : "PDF bundle"}{product.featured && " - Featured"}</p>
            <h3 className="break-words text-xl font-semibold">{product.name}</h3>
            <p className="break-words text-sm leading-6 text-foreground-secondary">{product.shortDescription}</p>
            <p className="border-t border-border pt-4 text-lg font-semibold text-foreground">{formatINR(product.pricePaise)} {product.compareAtPricePaise !== undefined && product.compareAtPricePaise > product.pricePaise && <span className="ml-2 text-sm font-normal text-foreground-secondary line-through">{formatINR(product.compareAtPricePaise)}</span>}</p>
            <Link href={"/products/" + encodeURIComponent(product.slug)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 font-semibold transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent">View details</Link>
            <ProductPurchaseAction productId={String(product._id)} productName={product.name} productType={product.productType} pricePaise={product.pricePaise} />
          </div>
        </article>)}
      </div>
      <Link href="/products" className="mt-8 inline-flex min-h-12 items-center rounded-full bg-accent px-6 font-semibold text-[#0f1e36] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Explore all products</Link>
    </div>
  </section>;
}
