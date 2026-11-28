export const CANONICAL_SITE_ORIGIN = "https://moneytreeventure.com";

function isCanonicalOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.origin === CANONICAL_SITE_ORIGIN && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

/** Netlify branch deploys stay unindexed even though they run production builds. */
export function isIndexableProduction(env: { APP_URL?: string; NETLIFY?: string; CONTEXT?: string } = { APP_URL: process.env.APP_URL, NETLIFY: process.env.NETLIFY, CONTEXT: process.env.CONTEXT }): boolean {
  return isCanonicalOrigin(env.APP_URL) && (!env.CONTEXT || env.CONTEXT === "production") &&
    (env.NETLIFY !== "true" || env.CONTEXT === "production");
}

/** Publish absolute search URLs only for the confirmed production deploy context. */
export function publicSiteOrigin(value = process.env.APP_URL): string | null {
  return isIndexableProduction({ ...process.env, APP_URL: value }) ? CANONICAL_SITE_ORIGIN : null;
}
