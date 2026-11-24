import type { NextConfig } from "next";

const privateRoutes = [
  "/account/:path*", "/admin/:path*", "/checkout/:path*",
  "/api/auth/:path*", "/api/admin/:path*", "/api/bookings/:path*",
  "/api/orders/:path*", "/api/purchases/:path*", "/api/internal/:path*",
  "/api/navigation/account",
];

function hasPublicHttpsOrigin(): boolean {
  try {
    const url = new URL(process.env.APP_URL ?? "");
    return url.protocol === "https:" && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production" && hasPublicHttpsOrigin()
            ? [{ key: "Strict-Transport-Security", value: "max-age=86400" }]
            : []),
        ],
      },
      ...privateRoutes.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      })),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
