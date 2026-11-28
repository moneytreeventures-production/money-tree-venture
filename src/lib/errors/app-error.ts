export interface SafeErrorDetail {
  field: string;
  message: string;
}

export interface ApplicationErrorOptions {
  code: string;
  statusCode: number;
  operational?: boolean;
  details?: readonly SafeErrorDetail[];
  cause?: unknown;
}

/** Base for expected failures with messages deliberately written for customers. */
export class ApplicationError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly operational: boolean;
  readonly details?: readonly SafeErrorDetail[];
  override readonly cause?: unknown;

  constructor(message: string, options: ApplicationErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.operational = options.operational ?? true;
    this.details = options.details;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends ApplicationError {
  constructor(details?: readonly SafeErrorDetail[], cause?: unknown) {
    super("Please check the information you entered.", { code: "VALIDATION_ERROR", statusCode: 400, details, cause });
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(cause?: unknown) {
    super("Please sign in to continue.", { code: "AUTHENTICATION_REQUIRED", statusCode: 401, cause });
  }
}

export class WebhookSignatureError extends ApplicationError {
  constructor() {
    super("The webhook signature could not be verified.", { code: "WEBHOOK_SIGNATURE_INVALID", statusCode: 401 });
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(cause?: unknown) {
    super("You do not have permission to perform this action.", { code: "FORBIDDEN", statusCode: 403, cause });
  }
}

export class NotFoundError extends ApplicationError {
  constructor(cause?: unknown) {
    super("The requested information was not found.", { code: "NOT_FOUND", statusCode: 404, cause });
  }
}

export class ConflictError extends ApplicationError {
  constructor(cause?: unknown) {
    super(typeof cause === "string" ? cause : "This request cannot be completed right now.", {
      code: "CONFLICT", statusCode: 409, ...(typeof cause === "string" ? {} : { cause }),
    });
  }
}

export class RateLimitError extends ApplicationError {
  constructor(cause?: unknown) {
    super("Too many requests. Please try again later.", { code: "RATE_LIMITED", statusCode: 429, cause });
  }
}

export class DatabaseError extends ApplicationError {
  constructor(cause?: unknown) {
    super("The service is temporarily unavailable. Please try again later.", { code: "DATABASE_UNAVAILABLE", statusCode: 503, cause });
  }
}

export class ExternalServiceError extends ApplicationError {
  constructor(cause?: unknown) {
    super("We could not complete your request. Please try again later.", { code: "EXTERNAL_SERVICE_ERROR", statusCode: 502, cause });
  }
}

/** Safe failure raised only when an optional provider is explicitly requested. */
export class IntegrationConfigurationError extends ApplicationError {
  constructor(provider: "Cloudflare R2" | "Public product media" | "Cashfree" | "Better Auth" | "MongoDB" | "Tax", missingKeys: readonly string[]) {
    super("This service is temporarily unavailable because required configuration is incomplete.", {
      code: `${provider === "Cashfree" ? "CASHFREE" : provider === "Better Auth" ? "BETTER_AUTH" : provider === "MongoDB" ? "MONGODB" : provider === "Tax" ? "TAX" : provider === "Public product media" ? "PUBLIC_MEDIA" : "R2"}_CONFIGURATION_ERROR`,
      statusCode: 503,
      details: missingKeys.map((field) => ({ field, message: "This configuration is required." })),
    });
  }
}

/** Provider failures preserve a safe provider-specific code without raw response data. */
export class ProviderCommunicationError extends ApplicationError {
  constructor(provider: "Cloudflare R2" | "Cashfree", kind: "network" | "rejected") {
    const prefix = provider === "Cashfree" ? "CASHFREE" : "R2";
    super("We could not complete your request. Please try again later.", {
      code: `${prefix}_${kind === "network" ? "NETWORK" : "PROVIDER"}_ERROR`,
      statusCode: 502,
    });
  }
}

export class InternalServerError extends ApplicationError {
  constructor(cause?: unknown) {
    super("Something went wrong. Please try again.", { code: "INTERNAL_ERROR", statusCode: 500, operational: false, cause });
  }
}
