import { AdminCategories } from "@/components/admin/admin-categories";

export const metadata = { title: "Categories | Admin" };

export default function AdminCategoriesPage() {
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12"><header className="mb-8"><p className="text-[11px] font-bold tracking-[0.18em] text-accent-foreground">CATALOGUE MANAGEMENT</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Categories</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">Create and maintain the categories used to organize products.</p></header><AdminCategories /></main>;
}
