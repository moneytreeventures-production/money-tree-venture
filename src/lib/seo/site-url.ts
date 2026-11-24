/** Publish absolute search URLs only when the owner configures a public HTTPS origin. */
export function publicSiteOrigin(value = process.env.APP_URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}
