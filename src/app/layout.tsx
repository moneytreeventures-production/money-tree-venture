import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import { Suspense } from "react";
import { publicSiteOrigin } from "@/lib/seo/site-url";

import "./globals.css";

export const metadata: Metadata = {
  ...(publicSiteOrigin() ? { metadataBase: new URL(publicSiteOrigin()!) } : {}),
  title: {
    default: "MoneyTreeVentures | Learn More. Explore More. Grow More.",
    template: "%s | MoneyTreeVentures",
  },

  description:
    "Explore practical PDF guides, starter kits, bundles and 1:1 Call Guidance for digital skills and new ideas.",

  applicationName: "MoneyTreeVentures",

  keywords: [
    "digital products",
    "freelancing guides",
    "online learning",
    "digital skills",
    "starter kits",
    "MoneyTreeVentures",
  ],

  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#F4F7FB",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#101827",
    },
  ],
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className="antialiased"
    >
      <body className="flex min-h-screen flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          storageKey="moneytreeventures-theme"
        >
          <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
            <CartProvider>{children}</CartProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
