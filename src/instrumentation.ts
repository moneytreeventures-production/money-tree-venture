/** Validate configured server environment values before Node.js serves requests. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { getServerEnv } = await import("./lib/env/server");
  getServerEnv();
}