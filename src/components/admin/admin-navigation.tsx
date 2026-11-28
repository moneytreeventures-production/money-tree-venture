"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChevronRight, FolderTree, Gift, LayoutDashboard, Menu, MessageSquare, Package, Star, X } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import ThemeToggle from "@/components/layout/theme-toggle";

const groups = [
  { label: "Workspace", links: [{ href: "/admin", label: "Overview", icon: LayoutDashboard }] },
  { label: "Catalogue", links: [
    { href: "/admin/products", label: "Products", icon: Package },
    { href: "/admin/categories", label: "Categories", icon: FolderTree },
    { href: "/admin/coupons", label: "Coupons", icon: Gift },
    { href: "/admin/reviews", label: "Reviews", icon: Star },
  ] },
  { label: "Operations", links: [
    { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
    { href: "/admin/support", label: "Support inbox", icon: MessageSquare },
  ] },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <>
    {groups.map((group) => <div key={group.label} className="mb-5">
      <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground-secondary">{group.label}</p>
      <div className="mt-2 grid gap-1">{group.links.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-xl border-l-[3px] px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? "border-accent bg-surface-secondary text-foreground" : "border-transparent text-foreground-secondary hover:bg-surface-secondary hover:text-foreground"}`}>
          <Icon size={18} aria-hidden="true" /><span className="flex-1">{label}</span>{active && <ChevronRight size={15} aria-hidden="true" />}
        </Link>;
      })}</div>
    </div>)}
    <div className="border-t border-border pt-4">
      <Link href="/" onClick={onNavigate} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-foreground-secondary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Public site</Link>
      <div className="mt-3 flex min-h-11 items-center justify-between gap-2 px-2"><ThemeToggle /><SignOutButton compact redirectTo="/" /></div>
    </div>
  </>;
}

export function AdminNavigation({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || variant !== "mobile") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, variant]);

  if (variant === "desktop") return <nav aria-label="Admin navigation" className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-sm"><NavigationLinks pathname={pathname} /></nav>;

  return <div className="relative xl:hidden">
    <button ref={menuButton} type="button" aria-label={open ? "Close admin navigation" : "Open admin navigation"} aria-expanded={open} aria-controls="admin-mobile-navigation" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />} Menu
    </button>
    {open && <nav id="admin-mobile-navigation" aria-label="Admin navigation" className="absolute right-0 top-full z-50 mt-3 max-h-[calc(100dvh-6rem)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-xl"><NavigationLinks pathname={pathname} onNavigate={() => setOpen(false)} /></nav>}
  </div>;
}
