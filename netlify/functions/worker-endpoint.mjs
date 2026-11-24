export function workerEndpoint(appUrl, pathname) {
  let origin;
  try {
    origin = new URL(appUrl);
  } catch {
    throw new Error("Worker APP_URL must be a valid site origin.");
  }
  const localHttp = origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    process.env.NODE_ENV !== "production";
  if ((origin.protocol !== "https:" && !localHttp) || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Worker APP_URL must be an HTTPS site origin (HTTP localhost is allowed only in development).");
  }
  return new URL(pathname, origin);
}
