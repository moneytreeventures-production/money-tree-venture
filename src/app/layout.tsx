import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import { Suspense } from "react";
import { publicSiteOrigin, CANONICAL_SITE_ORIGIN } from "@/lib/seo/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_SITE_ORIGIN),
  title: {
    default: "Money Tree Venture | Learn More. Explore More. Grow More.",
    template: "%s | Money Tree Venture",
  },

  description:
    "Explore practical PDF guides, starter kits, bundles and 1:1 Call Guidance for digital skills and new ideas.",

  applicationName: "Money Tree Venture",

  keywords: [
    "digital products",
    "freelancing guides",
    "online learning",
    "digital skills",
    "starter kits",
    "Money Tree Venture",
  ],

  openGraph: { type: "website", siteName: "Money Tree Venture", title: "Money Tree Venture", description: "Practical digital guides, resource bundles and 1:1 guidance.", images: ["/opengraph-image.png"] },
  twitter: { card: "summary_large_image", title: "Money Tree Venture", description: "Practical digital guides and learning resources.", images: ["/opengraph-image.png"] },
  robots: publicSiteOrigin() ? { index: true, follow: true } : { index: false, follow: false },
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
