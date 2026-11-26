import { classifyMongoFailure } from "./db/mongodb";
import { logger } from "./logger";

export type SupportFailureStage = "database_connection" | "rate_limit_counter" | "ticket_creation" | "other";
const loggedFailures = new WeakSet<object>();
export function wasSupportFailureLogged(error: unknown): boolean { return typeof error === "object" && error !== null && loggedFailures.has(error); }

export function logSupportFailure(stage: SupportFailureStage, error: unknown, durationMs: number, requestId?: string): void {
  const { errorName, errorCode, category } = classifyMongoFailure(error);
  logger.error("support.submission.failed", {
    stage,
    errorName,
    ...(errorCode === undefined ? {} : { errorCode }),
    category,
    durationMs: Math.max(0, Math.round(durationMs)),
    ...(requestId ? { requestId } : {}),
  });
}

export async function supportOperation<T>(stage: SupportFailureStage, operation: () => Promise<T>, requestId?: string): Promise<T> {
  const started = Date.now();
  try { return await operation(); }
  catch (error) { logSupportFailure(stage, error, Date.now() - started, requestId); if (typeof error === "object" && error !== null) loggedFailures.add(error); throw error; }
}
