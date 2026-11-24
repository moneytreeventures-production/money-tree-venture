import "server-only";

import { parseServerEnv, type ServerEnv } from "./schema";

let validatedEnv: ServerEnv | undefined;

/**
 * Read and validate configuration on first use, not during module import/build.
 * Unimplemented integrations remain optional until a server feature uses them.
 */
export function getServerEnv(): ServerEnv {
  validatedEnv ??= parseServerEnv(process.env);
  return validatedEnv;
}
