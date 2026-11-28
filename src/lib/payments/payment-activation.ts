import { ApplicationError } from "../errors/app-error";

/** Production runtimes fail closed until their deploy context explicitly opts in. */
export function paymentCollectionEnabled(env: { NODE_ENV?: string; PAYMENT_COLLECTION_MODE?: string; CASHFREE_ENVIRONMENT?: string; APP_URL?: string }): boolean {
  if (env.NODE_ENV !== "production") return env.PAYMENT_COLLECTION_MODE !== "disabled";
  return (env.PAYMENT_COLLECTION_MODE === "sandbox" && env.CASHFREE_ENVIRONMENT === "sandbox" && env.APP_URL === "https://staging.moneytreeventure.com") ||
    (env.PAYMENT_COLLECTION_MODE === "live" && env.CASHFREE_ENVIRONMENT === "production");
}

export function requirePaymentCollection(env: typeof process.env = process.env): void {
  if (!paymentCollectionEnabled(env)) throw new ApplicationError("Online purchases will be available soon.", { code: "PAYMENT_COLLECTION_DISABLED", statusCode: 503 });
}
