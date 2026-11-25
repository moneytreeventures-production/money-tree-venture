"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, Menu, ShoppingBag, Sprout, X } from "lucide-react";
import ThemeToggle from "./theme-toggle";
import { useCart } from "@/components/cart/cart-provider";
import { authClient } from "@/lib/auth/client";
import { getAccountNavigationDecision } from "@/lib/auth/account-navigation";

const navigation = [
  { label: "Home", href: "/" },
  { label: "Explore Kits", href: "/products" },
  { label: "About", href: "/about" },
  { label: "FAQs", href: "/faqs" },
  { label: "Contact", href: "/contact" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavbarContent() {
  const pathname = usePathname();
  const [menuOpenedAtPath, setMenuOpenedAtPath] = useState<string | null>(null);
  const mobileMenuOpen = menuOpenedAtPath === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { count } = useCart();
  const { data: session } = authClient.useSession();
  const [adminNavigation, setAdminNavigation] = useState<{ sessionKey: string; authorized: boolean } | null>(null);
  const sessionUserId = session?.user?.id ?? null;
  const sessionUpdatedAt = session?.session?.updatedAt?.toString() ?? "";
  const sessionKey = sessionUserId ? `${sessionUserId}:${sessionUpdatedAt}` : null;
  const isAuthorizedAdmin = Boolean(sessionKey && adminNavigation?.sessionKey === sessionKey && adminNavigation.authorized);

  useEffect(() => {
    if (!sessionKey) return;

    const controller = new AbortController();
    void fetch("/api/navigation/account", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) return false;
      const result: unknown = await response.json();
      return typeof result === "object" && result !== null && "isAdmin" in result && result.isAdmin === true;
    }).then((authorized) => {
      if (!controller.signal.aborted) setAdminNavigation({ sessionKey, authorized });
    }).catch(() => {
      if (!controller.signal.aborted) setAdminNavigation({ sessionKey, authorized: false });
    });

    return () => controller.abort();
  }, [sessionKey]);

  const { href: accountHref } = getAccountNavigationDecision(isAuthorizedAdmin);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && mobileMenuOpen) {
        setMenuOpenedAtPath(null);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  return (
    <header className="mt-header sticky top-0 border-b border-border/80 bg-background/95 backdrop-blur-xl">
      <div className="mt-container flex min-h-[76px] items-center justify-between gap-3">
        <Link href="/" className="group flex min-h-11 shrink-0 items-center gap-3" aria-label="MoneyTreeVentures — homepage">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-background transition-transform duration-300 group-hover:-rotate-6"><Sprout size={22} strokeWidth={1.8} /></span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight text-foreground sm:text-base">MoneyTree<span className="text-accent-foreground">Ventures</span></span>
            <span className="mt-1.5 text-[9px] font-semibold tracking-[0.08em] text-foreground-secondary max-[420px]:hidden">LEARN MORE · EXPLORE MORE · GROW MORE</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-5 xl:flex">
          {navigation.map((item) => {
            const active = isActive(pathname, item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`rounded-sm text-[13px] font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4 ${active ? "text-foreground" : "text-foreground-secondary"}`}>{item.label}</Link>;
          })}
        </nav>

        <div className="hidden items-center gap-2 xl:flex">
          <ThemeToggle />
          <Link href="/cart" aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-foreground-secondary transition-colors hover:bg-surface-secondary hover:text-foreground"><ShoppingBag size={17} />Cart ({count})</Link>
          <Link href={accountHref} className="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-foreground-secondary transition-colors hover:bg-surface-secondary hover:text-foreground">{isAuthorizedAdmin ? "Admin Panel" : "Account"}</Link>
          <Link href="/products" className="mt-button mt-button-primary group px-4 text-[13px] hover:shadow-[0_8px_22px_-10px_var(--accent)]">Explore kits<ArrowDownRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5" /></Link>
        </div>

        <div className="flex items-center gap-2 xl:hidden">
          <ThemeToggle />
          <button ref={menuButtonRef} type="button" onClick={() => setMenuOpenedAtPath(mobileMenuOpen ? null : pathname)} aria-label={mobileMenuOpen ? "Close menu" : "Open menu"} aria-controls="mobile-navigation" aria-expanded={mobileMenuOpen} className="flex size-11 items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent">
            {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-border bg-background py-4 xl:hidden">
        <div className="mt-container flex flex-col gap-1">
          {navigation.map((item) => {
            const active = isActive(pathname, item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setMenuOpenedAtPath(null)} className={`rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent ${active ? "bg-surface-secondary text-foreground" : "text-foreground-secondary"}`}>{item.label}</Link>;
          })}
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Link href="/cart" aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`} onClick={() => setMenuOpenedAtPath(null)} className="rounded-xl px-2 py-3 text-center text-sm font-semibold text-foreground-secondary hover:bg-surface-secondary">Cart ({count})</Link>
            <Link href={accountHref} onClick={() => setMenuOpenedAtPath(null)} className="rounded-xl px-3 py-3 text-center text-sm font-semibold text-foreground-secondary hover:bg-surface-secondary">{isAuthorizedAdmin ? "Admin Panel" : "Account"}</Link>
            <Link href="/products" onClick={() => setMenuOpenedAtPath(null)} className="mt-button mt-button-primary col-span-2">Explore kits <ArrowDownRight size={16} /></Link>
          </div>
        </div>
      </nav>}
    </header>
  );
}

function NavbarFallback() {
  return (
    <header className="mt-header sticky top-0 border-b border-border/80 bg-background/95 backdrop-blur-xl" aria-hidden="true">
      <div className="mt-container min-h-[76px]" />
    </header>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={<NavbarFallback />}>
      <NavbarContent />
    </Suspense>
  );
}
