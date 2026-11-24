import { z } from "zod";

const timezoneSchema = z.string().trim().min(1).max(64).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Timezone must be a valid IANA timezone.");

const isoDateTime = z.string().datetime({ offset: true });

export const customerAvailabilitySchema = z.object({
  timezone: timezoneSchema,
  requestedStartsAt: z.array(isoDateTime).min(1).max(5),
  customerNotes: z.string().trim().max(2000).optional(),
}).strict().superRefine((data, context) => {
  if (new Set(data.requestedStartsAt.map((value) => new Date(value).getTime())).size !== data.requestedStartsAt.length) {
    context.addIssue({ code: "custom", path: ["requestedStartsAt"], message: "Requested times must be unique." });
  }
});

export const adminBookingUpdateSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled"]),
  scheduledStartAt: isoDateTime.optional(),
  timezone: timezoneSchema.optional(),
  adminNotes: z.string().trim().max(4000).optional(),
  cancellationReason: z.string().trim().min(1).max(500).optional(),
}).strict().superRefine((data, context) => {
  if (data.status === "scheduled" && (!data.scheduledStartAt || !data.timezone)) {
    context.addIssue({ code: "custom", path: ["scheduledStartAt"], message: "Scheduling requires a start time and timezone." });
  }
  if (data.status === "cancelled" && !data.cancellationReason) {
    context.addIssue({ code: "custom", path: ["cancellationReason"], message: "Cancellation requires a reason." });
  }
  if (data.status !== "scheduled" && (data.scheduledStartAt !== undefined || data.timezone !== undefined)) {
    context.addIssue({ code: "custom", path: ["scheduledStartAt"], message: "Only a scheduled booking can include schedule details." });
  }
  if (data.status !== "cancelled" && data.cancellationReason !== undefined) {
    context.addIssue({ code: "custom", path: ["cancellationReason"], message: "Cancellation reason is only valid when cancelling a booking." });
  }
});

export type CustomerAvailabilityInput = z.infer<typeof customerAvailabilitySchema>;
export type AdminBookingUpdateInput = z.infer<typeof adminBookingUpdateSchema>;
