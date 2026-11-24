"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import ThemeToggle from "@/components/layout/theme-toggle";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/coupons", label: "Coupons" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function linkClass(active: boolean): string {
  return `inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
    active ? "bg-surface-secondary text-foreground" : "text-foreground-secondary hover:bg-surface-secondary hover:text-foreground"
  }`;
}

export function AdminNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <nav aria-label="Admin navigation" className="hidden items-center gap-1 md:flex">
        {links.map((link) => {
          const active = isActivePath(pathname, link.href);
          return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>{link.label}</Link>;
        })}
        <Link href="/" className={linkClass(false)}>Public site</Link>
        <ThemeToggle />
        <SignOutButton compact redirectTo="/" />
      </nav>

      <div className="relative flex items-center gap-2 md:hidden">
        <ThemeToggle />
        <button
          ref={menuButton}
          type="button"
          aria-label={open ? "Close admin navigation" : "Open admin navigation"}
          aria-expanded={open}
          aria-controls="admin-mobile-navigation"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
        <SignOutButton compact redirectTo="/" />
        <nav id="admin-mobile-navigation" aria-label="Admin navigation" hidden={!open} className="absolute right-0 top-full z-50 mt-3 grid w-[min(20rem,calc(100vw-2rem))] gap-1 rounded-2xl border border-border bg-surface p-3 shadow-xl">
          {links.map((link) => {
            const active = isActivePath(pathname, link.href);
            return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`${linkClass(active)} w-full justify-start px-4`}>{link.label}</Link>;
          })}
          <Link href="/" onClick={() => setOpen(false)} className={`${linkClass(false)} w-full justify-start px-4`}>Public site</Link>
        </nav>
      </div>
    </>
  );
}
