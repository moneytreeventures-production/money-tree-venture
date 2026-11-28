import "server-only";

import { z } from "zod";

const nonEmptyString = z.string().trim().min(1, "must not be empty").optional();

const httpUrl = z
  .string()
  .trim()
  .url("must be a valid absolute URL")
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "must use http or https");

const optionalHttpUrl = httpUrl.optional();

const apiVersion = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "must be a valid YYYY-MM-DD API version").optional();

const mongoUri = z
  .string()
  .trim()
  .refine((value) => {
    if (!value.startsWith("mongodb://") && !value.startsWith("mongodb+srv://")) {
      return false;
    }

    try {
      return new URL(value).hostname.length > 0;
    } catch {
      return false;
    }
  }, "must be a valid mongodb:// or mongodb+srv:// connection URI")
  .optional();

const integrationGroups = [
  {
    name: "MongoDB",
    keys: ["MONGODB_URI", "MONGODB_DB_NAME"],
  },
  {
    name: "Better Auth",
    keys: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
  },
  {
    name: "Google OAuth",
    keys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  {
    name: "Resend email",
    keys: ["RESEND_API_KEY", "EMAIL_FROM"],
  },
  {
    name: "public product media",
    keys: ["R2_PUBLIC_MEDIA_ACCESS_KEY_ID", "R2_PUBLIC_MEDIA_SECRET_ACCESS_KEY", "R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME", "R2_PUBLIC_MEDIA_BUCKET_NAME", "PUBLIC_MEDIA_BASE_URL"],
  },
] as const;

const emailAddress = z.string().trim().email("must be a valid email address");

const emailSender = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .refine((value) => {
    const displayAddress = value.match(/<([^<>]+)>\s*$/)?.[1];
    return emailAddress.safeParse(displayAddress ?? value).success;
  }, "must be an email address or a display name with an email address")
  .optional();

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_URL: optionalHttpUrl,

    MONGODB_URI: mongoUri,
    MONGODB_DB_NAME: nonEmptyString,

    BETTER_AUTH_SECRET: z.string().trim().min(32, "must be at least 32 characters").optional(),
    BETTER_AUTH_URL: optionalHttpUrl,
    GOOGLE_CLIENT_ID: nonEmptyString,
    GOOGLE_CLIENT_SECRET: nonEmptyString,
    ADMIN_ALLOWED_EMAILS: z.string().trim().refine((value) => !value || value.split(",").every((part) => emailAddress.safeParse(part.trim()).success), "must contain only comma-separated email addresses").optional(),

    CASHFREE_CLIENT_ID: nonEmptyString,
    CASHFREE_CLIENT_SECRET: nonEmptyString,
    CASHFREE_ENVIRONMENT: z.enum(["sandbox", "production"]).optional(),
    PAYMENT_COLLECTION_MODE: z.enum(["disabled", "sandbox", "live"]).optional(),
    CASHFREE_API_VERSION: apiVersion,
    CASHFREE_WEBHOOK_VERSION: apiVersion,
    CASHFREE_RETURN_URL_BASE: optionalHttpUrl,

    R2_ACCOUNT_ID: nonEmptyString,
    R2_ACCESS_KEY_ID: nonEmptyString,
    R2_SECRET_ACCESS_KEY: nonEmptyString,
    R2_BUCKET_NAME: nonEmptyString,
    R2_ENDPOINT: optionalHttpUrl,
    R2_REGION: z.string().trim().min(1, "must not be empty").default("auto"),
    R2_MAX_UPLOAD_BYTES: z.coerce.number().int().min(1).max(100 * 1024 * 1024).default(25 * 1024 * 1024),
    R2_PUBLIC_MEDIA_ACCESS_KEY_ID: nonEmptyString,
    R2_PUBLIC_MEDIA_SECRET_ACCESS_KEY: nonEmptyString,
    R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME: nonEmptyString,
    R2_PUBLIC_MEDIA_BUCKET_NAME: nonEmptyString,
    PUBLIC_MEDIA_BASE_URL: optionalHttpUrl,
    PUBLIC_MEDIA_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(600).default(300),
    R2_PUBLIC_MEDIA_MAX_IMAGE_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(8 * 1024 * 1024),
    R2_PUBLIC_MEDIA_MAX_VIDEO_BYTES: z.coerce.number().int().min(1024).max(100 * 1024 * 1024).default(50 * 1024 * 1024),

    RESEND_API_KEY: nonEmptyString,
    EMAIL_FROM: emailSender,
    SUPPORT_EMAIL: emailAddress.optional(),

    OUTBOX_WORKER_SECRET: z.string().trim().min(32, "must be at least 32 characters").optional(),
    DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(1).max(900).default(60),
  })
  .superRefine((values, context) => {
    for (const group of integrationGroups) {
      const configured = group.keys.some((key) => values[key] !== undefined);

      if (!configured) {
        continue;
      }

      for (const key of group.keys) {
        if (values[key] === undefined || values[key] === "") {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `is required when ${group.name} configuration is provided`,
          });
        }
      }
    }
    if ((values.RESEND_API_KEY || values.EMAIL_FROM) && !values.APP_URL) {
      context.addIssue({ code: "custom", path: ["APP_URL"], message: "is required when Resend email configuration is provided" });
    }
    const publicMediaConfigured = [values.R2_PUBLIC_MEDIA_ACCESS_KEY_ID, values.R2_PUBLIC_MEDIA_SECRET_ACCESS_KEY, values.R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME, values.R2_PUBLIC_MEDIA_BUCKET_NAME, values.PUBLIC_MEDIA_BASE_URL].some((value) => value !== undefined);
    if (publicMediaConfigured) {
      for (const key of ["R2_ACCOUNT_ID", "R2_ENDPOINT"] as const) {
        if (values[key] === undefined || values[key] === "") {
          context.addIssue({ code: "custom", path: [key], message: "is required when public product media configuration is provided" });
        }
      }
    }
    if (values.R2_PUBLIC_MEDIA_BUCKET_NAME && values.R2_PUBLIC_MEDIA_BUCKET_NAME === values.R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME) {
      context.addIssue({ code: "custom", path: ["R2_PUBLIC_MEDIA_BUCKET_NAME"], message: "must be separate from the private upload-staging bucket" });
    }
    if (values.R2_PUBLIC_MEDIA_BUCKET_NAME && values.R2_PUBLIC_MEDIA_BUCKET_NAME === values.R2_BUCKET_NAME) {
      context.addIssue({ code: "custom", path: ["R2_PUBLIC_MEDIA_BUCKET_NAME"], message: "must be separate from the private PDF bucket" });
    }
    if (values.R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME && values.R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME === values.R2_BUCKET_NAME) {
      context.addIssue({ code: "custom", path: ["R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME"], message: "must be separate from the private PDF bucket" });
    }
    if (values.NODE_ENV === "production" && values.PUBLIC_MEDIA_BASE_URL && new URL(values.PUBLIC_MEDIA_BASE_URL).hostname.endsWith(".r2.dev")) {
      context.addIssue({ code: "custom", path: ["PUBLIC_MEDIA_BASE_URL"], message: "must use a configured HTTPS custom domain in production" });
    }
  });

export type ServerEnv = z.output<typeof serverEnvSchema>;

/** Parse server environment values without including secret contents in errors. */
export function parseServerEnv(input: NodeJS.ProcessEnv | Record<string, string | undefined>): ServerEnv {
  const unsupportedPublicVariables = Object.keys(input).filter(
    (key) => key.startsWith("NEXT_PUBLIC_") && input[key] !== undefined,
  );

  if (unsupportedPublicVariables.length > 0) {
    throw new Error(
      `No browser-exposed environment variables are approved yet: ${unsupportedPublicVariables.join(", ")}`,
    );
  }

  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `- ${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid server environment configuration:\n${details}`);
  }

  return result.data;
}
