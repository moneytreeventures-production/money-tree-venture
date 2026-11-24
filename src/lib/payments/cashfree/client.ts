import "server-only";

import { ProviderCommunicationError } from "../../errors/app-error";
import { createLogger } from "../../logger";
import { getCashfreeConfiguration, type CashfreeConfiguration } from "./config";

export type CashfreeHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface CashfreeCreateOrderInput {
  orderId: string;
  idempotencyKey: string;
  amountPaise: number;
  currency: "INR";
  customer: { customerId: string; name: string; email: string; phone: string };
  returnUrl: string;
  notifyUrl?: string;
  expiresAt: Date;
}

export interface CashfreeOrderResult {
  orderId: string;
  gatewayOrderId?: string;
  amountPaise?: number;
  currency?: string;
  status: string;
  paymentSessionId?: string;
}

export interface CashfreePaymentResult {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  currency: "INR";
  status: string;
  gatewayOrderId?: string;
}

export interface CashfreeRefundResult {
  orderId: string;
  paymentId: string;
  refundId: string;
  providerRefundId?: string;
  amountPaise: number;
  currency: "INR";
  status: string;
  arn?: string;
}

export interface CashfreeCreateRefundInput {
  orderId: string;
  refundId: string;
  idempotencyKey: string;
  amountPaise: number;
  reason: string;
}

/** Business operations are implemented by a later payment-service phase. */
export interface CashfreeGateway {
  createOrder(input: CashfreeCreateOrderInput): Promise<CashfreeOrderResult>;
  fetchOrder(orderId: string): Promise<CashfreeOrderResult>;
  fetchPayments(orderId: string): Promise<readonly CashfreePaymentResult[]>;
  fetchPayment(orderId: string, paymentId: string): Promise<CashfreePaymentResult>;
  createRefund(input: CashfreeCreateRefundInput): Promise<CashfreeRefundResult>;
  fetchRefund(orderId: string, refundId: string): Promise<CashfreeRefundResult>;
}

export interface CashfreeClientOptions {
  fetcher?: typeof fetch;
  log?: (fields: Readonly<Record<string, unknown>>) => void;
}

const logger = createLogger();
const SAFE_API_PATH = /^\/(?:orders(?:\/[A-Za-z0-9_-]+(?:\/(?:payments|payments\/[A-Za-z0-9_-]+|refunds|refunds\/[A-Za-z0-9_-]+))?)?)$/;

export class CashfreeRestClient {
  readonly #configuration: CashfreeConfiguration;
  readonly #fetcher: typeof fetch;
  readonly #log: (fields: Readonly<Record<string, unknown>>) => void;

  constructor(configuration: CashfreeConfiguration, options: CashfreeClientOptions = {}) {
    this.#configuration = configuration;
    this.#fetcher = options.fetcher ?? fetch;
    this.#log = options.log ?? ((fields) => logger.error("Cashfree API request failed", fields));
  }

  /** Low-level server-only transport. No payment operation invokes this in Phase 2.5. */
  async request<T>(path: string, method: CashfreeHttpMethod, body?: unknown, extraHeaders: Readonly<Record<string, string>> = {}): Promise<T> {
    if (!SAFE_API_PATH.test(path)) {
      throw new TypeError("Unsupported Cashfree API path.");
    }

    const url = `${this.#configuration.baseUrl}${path}`;
    let response: Response;
    try {
      response = await this.#fetcher(url, {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(method === "GET" ? 10000 : 20000),
        headers: {
          "content-type": "application/json",
          "x-api-version": this.#configuration.apiVersion,
          "x-client-id": this.#configuration.clientId,
          "x-client-secret": this.#configuration.clientSecret,
          ...extraHeaders,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      this.#log({ provider: "cashfree", operation: method, errorName: error instanceof Error ? error.name : "UnknownError" });
      throw new ProviderCommunicationError("Cashfree", "network");
    }

    if (!response.ok) {
      this.#log({ provider: "cashfree", operation: method, statusCode: response.status });
      throw new ProviderCommunicationError("Cashfree", "rejected");
    }

    if (response.status === 204) return undefined as T;
    try {
      return await response.json() as T;
    } catch {
      this.#log({ provider: "cashfree", operation: method, statusCode: response.status, failure: "invalid-json" });
      throw new ProviderCommunicationError("Cashfree", "rejected");
    }
  }

  async createOrder(input: CashfreeCreateOrderInput): Promise<CashfreeOrderResult> {
    const response = await this.request<{
      order_id: string; cf_order_id?: string; order_status: string; order_amount?: number; order_currency?: string; payment_session_id?: string;
    }>("/orders", "POST", {
      order_id: input.orderId,
      order_amount: input.amountPaise / 100,
      order_currency: input.currency,
      customer_details: {
        customer_id: input.customer.customerId,
        customer_name: input.customer.name,
        customer_email: input.customer.email,
        customer_phone: input.customer.phone,
      },
      order_meta: { return_url: input.returnUrl, ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}) },
      order_expiry_time: input.expiresAt.toISOString(),
    }, { "x-idempotency-key": input.idempotencyKey });
    return {
      orderId: response.order_id,
      ...(response.cf_order_id ? { gatewayOrderId: response.cf_order_id } : {}),
      ...(typeof response.order_amount === "number" ? { amountPaise: Math.round(response.order_amount * 100) } : {}),
      ...(response.order_currency ? { currency: response.order_currency } : {}),
      status: response.order_status,
      ...(response.payment_session_id ? { paymentSessionId: response.payment_session_id } : {}),
    };
  }

  async fetchOrder(orderId: string): Promise<CashfreeOrderResult> {
    const response = await this.request<{
      order_id: string; cf_order_id?: string; order_status: string; order_amount?: number; order_currency?: string; payment_session_id?: string;
    }>(`/orders/${encodeURIComponent(orderId)}`, "GET");
    return {
      orderId: response.order_id,
      ...(response.cf_order_id ? { gatewayOrderId: response.cf_order_id } : {}),
      ...(typeof response.order_amount === "number" ? { amountPaise: Math.round(response.order_amount * 100) } : {}),
      ...(response.order_currency ? { currency: response.order_currency } : {}),
      status: response.order_status,
      ...(response.payment_session_id ? { paymentSessionId: response.payment_session_id } : {}),
    };
  }

  async fetchPayments(orderId: string): Promise<readonly CashfreePaymentResult[]> {
    const response = await this.request<Array<Record<string, unknown>>>(`/orders/${encodeURIComponent(orderId)}/payments`, "GET");
    return response.map((payment) => parsePaymentResult(payment));
  }

  async fetchPayment(orderId: string, paymentId: string): Promise<CashfreePaymentResult> {
    const response = await this.request<Record<string, unknown>>(
      `/orders/${encodeURIComponent(orderId)}/payments/${encodeURIComponent(paymentId)}`, "GET",
    );
    return parsePaymentResult(response);
  }

  async createRefund(input: CashfreeCreateRefundInput): Promise<CashfreeRefundResult> {
    const result = await this.request<Record<string, unknown>>(`/orders/${encodeURIComponent(input.orderId)}/refunds`, "POST", {
      refund_amount: input.amountPaise / 100,
      refund_id: input.refundId,
      refund_note: input.reason,
      refund_speed: "STANDARD",
    }, { "x-idempotency-key": input.idempotencyKey });
    return parseRefundResult(result);
  }

  async fetchRefund(orderId: string, refundId: string): Promise<CashfreeRefundResult> {
    const result = await this.request<Record<string, unknown>>(
      `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`, "GET",
    );
    return parseRefundResult(result);
  }
}

function parsePaymentResult(value: Record<string, unknown>): CashfreePaymentResult {
  const orderId = value.order_id;
  const rawPaymentId = value.cf_payment_id;
  const amount = value.payment_amount;
  const currency = value.payment_currency;
  const status = value.payment_status;
  if (typeof orderId !== "string" || (typeof rawPaymentId !== "string" && typeof rawPaymentId !== "number") || typeof amount !== "number" ||
    !Number.isFinite(amount) || typeof currency !== "string" || typeof status !== "string") {
    throw new ProviderCommunicationError("Cashfree", "rejected");
  }
  const amountPaise = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new ProviderCommunicationError("Cashfree", "rejected");
  return { orderId, paymentId: String(rawPaymentId), amountPaise, currency: currency as "INR", status };
}

function parseRefundResult(value: Record<string, unknown>): CashfreeRefundResult {
  const orderId = value.order_id;
  const rawPaymentId = value.cf_payment_id;
  const refundId = value.refund_id;
  const rawRefundId = value.cf_refund_id;
  const amount = value.refund_amount;
  const currency = value.refund_currency;
  const status = value.refund_status;
  if (typeof orderId !== "string" || (typeof rawPaymentId !== "string" && typeof rawPaymentId !== "number") ||
    typeof refundId !== "string" || (typeof rawRefundId !== "string" && typeof rawRefundId !== "number") ||
    typeof amount !== "number" || !Number.isFinite(amount) || typeof currency !== "string" || typeof status !== "string") {
    throw new ProviderCommunicationError("Cashfree", "rejected");
  }
  const amountPaise = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) throw new ProviderCommunicationError("Cashfree", "rejected");
  return {
    orderId,
    paymentId: String(rawPaymentId),
    refundId,
    providerRefundId: String(rawRefundId),
    amountPaise,
    currency: currency as "INR",
    status,
    ...(typeof value.refund_arn === "string" ? { arn: value.refund_arn } : {}),
  };
}

export function createCashfreeClient(
  configuration: CashfreeConfiguration,
  options: CashfreeClientOptions = {},
): CashfreeRestClient {
  return new CashfreeRestClient(configuration, options);
}

export function createLazyCashfreeClient(
  getConfiguration: () => CashfreeConfiguration,
  options: CashfreeClientOptions = {},
): () => CashfreeRestClient {
  let client: CashfreeRestClient | undefined;
  return () => {
    client ??= createCashfreeClient(getConfiguration(), options);
    return client;
  };
}

/** Importing this module does not read credentials or contact Cashfree. */
export const getCashfreeClient = createLazyCashfreeClient(getCashfreeConfiguration);
