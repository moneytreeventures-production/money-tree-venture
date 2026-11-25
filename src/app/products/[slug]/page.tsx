import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { ProductMainMedia } from "@/components/catalog/product-main-media";
import { ProductReviews } from "@/components/catalog/product-reviews";
import { ProductPurchaseAction } from "@/components/catalog/product-purchase-action";
import { getPublicProductPageData } from "@/lib/catalog/product-service";
import { productSlugSchema } from "@/lib/catalog/product-validation";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { formatINR } from "@/lib/format/currency";

type PageProps = { params: Promise<{ slug: string }> };
const getPageData = cache((slug: string) => getPublicProductPageData(slug));

function safeImageSource(reference?: string): string | undefined {
  if (!reference) return undefined;
  if (reference.startsWith("/") && !reference.startsWith("//") && !reference.includes("\\")) return reference;
  try { const url = new URL(reference); return url.protocol === "https:" ? url.toString() : undefined; }
  catch { return undefined; }
}

function typeLabel(product: Awaited<ReturnType<typeof getPublicProductPageData>>["product"]) {
  if (product.productType === "pdf") return "PDF guide";
  if (product.productType === "call_guidance") return "1:1 Call Guidance";
  return product.bundleKind === "starter_kit" ? "PDF starter kit" : "PDF bundle";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!productSlugSchema.safeParse(slug).success) return { title: "Product not found", robots: { index: false, follow: false } };
  await connection();
  try {
    const { product } = await getPageData(slug);
    const thumbnail = safeImageSource(product.imageRefs?.[0]);
    return {
      title: product.seo?.title || product.name,
      description: product.seo?.description || product.shortDescription,
      alternates: { canonical: `/products/${encodeURIComponent(product.slug)}` },
      openGraph: { title: product.seo?.title || product.name, description: product.seo?.description || product.shortDescription, ...(thumbnail ? { images: [thumbnail] } : {}) },
    };
  } catch {
    return { title: "Product not found", robots: { index: false, follow: false } };
  }
}

export default function ProductDetailPage({ params }: PageProps) {
  return <><Navbar /><main className="flex-1"><Suspense fallback={<div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-5 text-sm text-foreground-secondary" role="status">Loading product details...</div>}><ProductContent params={params} /></Suspense></main><Footer /></>;
}

async function ProductContent({ params }: PageProps) {
  await connection();
  const { slug } = await params;
  if (!productSlugSchema.safeParse(slug).success) notFound();
  let data: Awaited<ReturnType<typeof getPublicProductPageData>>;
  try { data = await getPageData(slug); }
  catch (error) { if (error instanceof NotFoundError || error instanceof ValidationError) notFound(); throw error; }
  const { product, categories, includedProducts } = data;
  const bundleKind = product.bundleKind === "starter_kit" ? "PDF starter kit" : "PDF bundle";

  return <><article className="mt-container max-w-6xl py-10 sm:py-14 lg:py-16">
      <Link href="/products" className="mt-button mt-button-outline min-h-10 px-4 text-foreground-secondary">← Back to products</Link>
    <div className="mt-7 grid items-start gap-9 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
      <ProductMainMedia name={product.name} thumbnailRef={product.imageRefs?.[0]} promotionalVideoUrl={product.promotionalVideoUrl} videoUnavailableMessage="The video could not be played. The product thumbnail is shown instead." previewUnavailableMessage="Product preview is currently unavailable." />
      <div className="lg:py-3">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-accent/15 px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-accent-foreground">{typeLabel(product)}</span>{product.featured && <span className="rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold text-foreground-secondary">Featured</span>}{product.productType === "pdf_bundle" && <span className="rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold text-foreground-secondary">{bundleKind}</span>}</div>
        <p className="mt-5 break-all text-xs font-medium text-foreground-secondary">/products/{product.slug}</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-foreground [text-wrap:balance] sm:text-5xl">{product.name}</h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary">{product.shortDescription}</p>
        <p className="mt-2 text-xs leading-5 text-foreground-secondary">Product descriptions and included-content details are shown in the language provided by the publisher.</p>
        {product.productType === "call_guidance" && product.callDurationMinutes && <p className="mt-4 text-sm font-medium text-foreground-secondary">{`${product.callDurationMinutes} minute session`}</p>}
        <div className="mt-7 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-border py-5"><span className="text-3xl font-semibold tracking-tight text-foreground">{formatINR(product.pricePaise)}</span>{product.compareAtPricePaise !== undefined && product.compareAtPricePaise > product.pricePaise && <span className="text-base text-foreground-secondary line-through">{formatINR(product.compareAtPricePaise)}</span>}<span className="w-full text-xs text-foreground-secondary">Price in INR. Review the final amount payable at checkout. <Link href="/billing-information" className="underline underline-offset-2">Billing details</Link>.</span></div>
        <div className="mt-5"><ProductPurchaseAction productId={String(product._id)} productName={product.name} productType={product.productType} pricePaise={product.pricePaise} /></div>
        <div className="mt-7"><h2 className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-secondary">Category</h2>{categories.length ? <ul className="mt-2 flex flex-wrap gap-2">{categories.map((category) => <li key={category.id} className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground">{category.name}</li>)}</ul> : <p className="mt-2 text-sm text-foreground-secondary">Unavailable</p>}</div>
      </div>
    </div>

    {product.description.trim() && <section className="mt-14 max-w-3xl border-t border-border pt-8 sm:mt-20"><h2 className="text-2xl font-semibold tracking-tight text-foreground">Product details</h2><p className="mt-4 whitespace-pre-line text-sm leading-7 text-foreground-secondary sm:text-base">{product.description}</p></section>}
    {product.features.length > 0 && <section className="mt-10 max-w-3xl"><h2 className="text-xl font-semibold text-foreground">Features</h2><ul className="mt-4 grid gap-3 sm:grid-cols-2">{product.features.map((feature, index) => <li key={`${index}-${feature}`} className="rounded-xl border border-border bg-surface p-4 text-sm leading-6 text-foreground-secondary">{feature}</li>)}</ul></section>}
    {product.benefits.length > 0 && <section className="mt-10 max-w-3xl"><h2 className="text-xl font-semibold text-foreground">Benefits</h2><ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-6 text-foreground-secondary">{product.benefits.map((benefit, index) => <li key={`${index}-${benefit}`}>{benefit}</li>)}</ul></section>}
    {product.includedContent.length > 0 && <section className="mt-10 max-w-3xl"><h2 className="text-xl font-semibold text-foreground">What’s included</h2><ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-6 text-foreground-secondary">{product.includedContent.map((content, index) => <li key={`${index}-${content}`}>{content}</li>)}</ul></section>}
    {product.productType === "pdf_bundle" && <section className="mt-12 border-t border-border pt-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-foreground">{bundleKind}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Included PDFs</h2></div><span className="text-xs text-foreground-secondary">{includedProducts.length} Individual PDF</span></div>{includedProducts.length ? <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{includedProducts.map((included) => <li key={included.id} className="flex gap-4 rounded-2xl border border-border bg-surface p-4">{safeImageSource(included.imageRefs?.[0]) && <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-background"><Image src={safeImageSource(included.imageRefs[0])!} alt="" fill sizes="64px" unoptimized className="object-cover" /></div>}<div className="min-w-0"><Link href={`/products/${encodeURIComponent(included.slug)}`} className="font-semibold text-foreground hover:underline">{included.name}</Link><p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground-secondary">{included.shortDescription}</p></div></li>)}</ul> : <p className="mt-4 text-sm text-foreground-secondary">Unavailable</p>}</section>}
    {product.faqs.length > 0 && <section className="mt-12 max-w-3xl border-t border-border pt-8"><h2 className="text-2xl font-semibold tracking-tight text-foreground">Frequently asked questions</h2><div className="mt-5 divide-y divide-border border-y border-border">{product.faqs.map((faq, index) => <details key={`${index}-${faq.question}`} className="group py-4"><summary className="cursor-pointer list-none pr-8 text-sm font-semibold text-foreground marker:hidden focus-visible:outline-2 focus-visible:outline-accent">{faq.question}</summary><p className="mt-3 whitespace-pre-line text-sm leading-6 text-foreground-secondary">{faq.answer}</p></details>)}</div></section>}
  </article><Suspense fallback={<p className="px-5">Loading reviews...</p>}><ProductReviews productId={String(product._id)} /></Suspense></>;
}

