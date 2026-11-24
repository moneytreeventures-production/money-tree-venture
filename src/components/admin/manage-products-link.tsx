import Link from "next/link";

export function ManageProductsLink() {
  return (
    <Link href="/admin/products" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-[#0f1e36] shadow-sm transition-colors hover:bg-accent-hover hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      Manage products
    </Link>
  );
}
