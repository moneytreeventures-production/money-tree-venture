import Image from "next/image";

export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return <span className="mt-brand-logo relative size-12 shrink-0 overflow-hidden rounded-full">
    <Image src="/images/logo.jpeg" alt="Money Tree Venture" fill sizes="48px" className="object-cover" priority={priority} unoptimized />
  </span>;
}
