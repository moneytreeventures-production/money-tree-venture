import "server-only";

import mongoose, { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { connectToDatabase } from "../db/mongodb";
import { AuditLogModel, BookingModel, OrderModel, OutboxEventModel, PaymentModel, PurchaseModel, type Booking } from "../db/models";
import { ConflictError, NotFoundError, ValidationError } from "../errors/app-error";
import { activePaidOrderFilter } from "./entitlement-policy";
import { assertBookingTransition, bookingEntitlementFilter, verifiedBookingPaymentFilter } from "./booking-policy";
import { adminBookingUpdateSchema, customerAvailabilitySchema } from "./booking-validation";

function objectId(value: string, field: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ValidationError([{ field, message: "This booking reference is invalid." }]);
  return new Types.ObjectId(value);
}

function parseInput<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues.map((issue) => ({ field: issue.path.map(String).join(".") || "booking", message: issue.message })));
  return result.data;
}

export function toCustomerBookingView(booking: Booking & { _id: Types.ObjectId }) {
  return {
    id: booking._id.toString(),
    bookingReference: booking.bookingReference,
    orderId: booking.orderId.toString(),
    productId: booking.productId.toString(),
    status: booking.status,
    requestedSlots: booking.requestedSlots.map((slot) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt, timezone: slot.timezone })),
    timezone: booking.timezone,
    scheduledStartAt: booking.scheduledStartAt,
    scheduledEndAt: booking.scheduledEndAt,
    sessionDurationMinutes: booking.sessionDurationMinutes,
    schedulingInstructions: booking.schedulingInstructions,
    customerNotes: booking.customerNotes,
    completedAt: booking.completedAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.status === "cancelled" ? booking.cancellationReason : undefined,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

export async function listCustomerBookings(customerIdValue: string) {
  await connectToDatabase();
  const userId = objectId(customerIdValue, "userId");
  const bookings = await BookingModel.find({ userId }).sort({ createdAt: -1 }).limit(100).lean().exec();
  return bookings.map((booking) => toCustomerBookingView(booking as unknown as Booking & { _id: Types.ObjectId }));
}

export async function getCustomerBooking(bookingIdValue: string, customerIdValue: string) {
  await connectToDatabase();
  const bookingId = objectId(bookingIdValue, "bookingId");
  const userId = objectId(customerIdValue, "userId");
  const booking = await BookingModel.findOne({ _id: bookingId, userId }).lean().exec();
  if (!booking) throw new NotFoundError();
  return toCustomerBookingView(booking as unknown as Booking & { _id: Types.ObjectId });
}

export async function requestBookingAvailability(bookingIdValue: string, customerIdValue: string, input: unknown) {
  await connectToDatabase();
  const bookingId = objectId(bookingIdValue, "bookingId");
  const userId = objectId(customerIdValue, "userId");
  const data = parseInput(customerAvailabilitySchema, input);
  const now = Date.now();
  const starts = data.requestedStartsAt.map((value) => new Date(value));
  if (starts.some((start) => start.getTime() < now + 60 * 60 * 1000 || start.getTime() > now + 90 * 24 * 60 * 60 * 1000)) {
    throw new ValidationError([{ field: "requestedStartsAt", message: "Choose a preferred time at least one hour ahead and within 90 days." }]);
  }
  const session = await mongoose.connection.getClient().startSession();
  let updated: (Booking & { _id: Types.ObjectId }) | undefined;
  try {
    await session.withTransaction(async () => {
      const booking = await BookingModel.findOne({ _id: bookingId, userId }).session(session);
      if (!booking) throw new NotFoundError();
      if (booking.status !== "awaiting_scheduling") throw new ConflictError();
      const entitlement = await PurchaseModel.exists(bookingEntitlementFilter({
        purchaseId: booking.purchaseId, userId, orderId: booking.orderId, productId: booking.productId,
      })).session(session);
      if (!entitlement) throw new NotFoundError();
      const paidOrder = await OrderModel.findOne({ _id: booking.orderId, userId, ...activePaidOrderFilter() }).select("totalPaise gatewayEnvironment").session(session).lean().exec();
      const verifiedPayment = paidOrder && await PaymentModel.exists(verifiedBookingPaymentFilter({ orderId: booking.orderId, userId, amountPaise: paidOrder.totalPaise, gatewayEnvironment: paidOrder.gatewayEnvironment })).session(session);
      if (!verifiedPayment) throw new NotFoundError();
      booking.requestedSlots = starts.map((start) => ({
        startsAt: start,
        endsAt: new Date(start.getTime() + booking.sessionDurationMinutes * 60_000),
        timezone: data.timezone,
      }));
      booking.timezone = data.timezone;
      booking.customerNotes = data.customerNotes;
      await booking.save({ session });
      await AuditLogModel.create([{
        actorType: "customer", actorUserId: userId, action: "booking.availability_requested",
        targetType: "booking", targetId: booking._id.toString(),
        changedFields: ["requestedSlots", "timezone", "customerNotes"],
      }], { session });
      updated = booking as unknown as Booking & { _id: Types.ObjectId };
    });
  } finally {
    await session.endSession();
  }
  if (!updated) throw new ConflictError();
  return toCustomerBookingView(updated);
}

export async function listAdminBookings(input: { status?: string; page?: string | number; pageSize?: string | number } = {}) {
  await connectToDatabase();
  const page = Number(input.page ?? 1);
  const pageSize = Number(input.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 10_000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      (input.status !== undefined && !["awaiting_scheduling", "scheduled", "confirmed", "completed", "cancelled"].includes(input.status))) {
    throw new ValidationError([{ field: "query", message: "Booking filters are invalid." }]);
  }
  const filter = input.status ? { status: input.status as Booking["status"] } : {};
  const [bookings, total] = await Promise.all([
    BookingModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec() as unknown as Promise<Array<Booking & { _id: Types.ObjectId }>>,
    BookingModel.countDocuments(filter),
  ]);
  const orderIds = [...new Map(bookings.map((booking) => [booking.orderId.toString(), booking.orderId])).values()];
  const orders = orderIds.length ? await OrderModel.find({ _id: { $in: orderIds } }).select("orderReference customerSnapshot").lean().exec() : [];
  const orderById = new Map(orders.map((order) => [order._id.toString(), order]));
  return {
    items: bookings.map((booking) => ({
      id: booking._id.toString(), bookingReference: booking.bookingReference,
      orderReference: orderById.get(booking.orderId.toString())?.orderReference,
      customer: orderById.get(booking.orderId.toString())?.customerSnapshot,
      userId: booking.userId.toString(), purchaseId: booking.purchaseId.toString(), productId: booking.productId.toString(),
      status: booking.status, requestedSlots: booking.requestedSlots, timezone: booking.timezone,
      scheduledStartAt: booking.scheduledStartAt, scheduledEndAt: booking.scheduledEndAt,
      sessionDurationMinutes: booking.sessionDurationMinutes, schedulingInstructions: booking.schedulingInstructions,
      customerNotes: booking.customerNotes, adminNotes: booking.adminNotes,
      assignedAdminId: booking.assignedAdminId?.toString(), cancelledAt: booking.cancelledAt,
      cancellationReason: booking.cancellationReason, completedAt: booking.completedAt,
      createdAt: booking.createdAt, updatedAt: booking.updatedAt,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function manageBooking(bookingIdValue: string, adminIdValue: string, input: unknown) {
  await connectToDatabase();
  const bookingId = objectId(bookingIdValue, "bookingId");
  const adminId = objectId(adminIdValue, "adminId");
  const data = parseInput(adminBookingUpdateSchema, input);
  const session = await mongoose.connection.getClient().startSession();
  let updated: (Booking & { _id: Types.ObjectId }) | undefined;
  try {
    await session.withTransaction(async () => {
      const booking = await BookingModel.findById(bookingId).session(session);
      if (!booking) throw new NotFoundError();
      assertBookingTransition(booking.status, data.status);
      const entitled = await PurchaseModel.exists(bookingEntitlementFilter({ purchaseId: booking.purchaseId, userId: booking.userId, orderId: booking.orderId, productId: booking.productId })).session(session);
      const paidOrder = entitled && await OrderModel.findOne({ _id: booking.orderId, userId: booking.userId, ...activePaidOrderFilter() }).select("totalPaise gatewayEnvironment").session(session).lean().exec();
      const verifiedPayment = paidOrder && await PaymentModel.exists(verifiedBookingPaymentFilter({ orderId: booking.orderId, userId: booking.userId, amountPaise: paidOrder.totalPaise, gatewayEnvironment: paidOrder.gatewayEnvironment })).session(session);
      if (!verifiedPayment) throw new NotFoundError();
      const changedFields = ["status"];
      if (data.status === "scheduled") {
        const start = new Date(data.scheduledStartAt!);
        if (start.getTime() <= Date.now()) throw new ValidationError([{ field: "scheduledStartAt", message: "Choose a future appointment time." }]);
        booking.status = "scheduled";
        booking.scheduledStartAt = start;
        booking.scheduledEndAt = new Date(start.getTime() + booking.sessionDurationMinutes * 60_000);
        // Serialize scheduling for this owner in the transaction before checking overlaps.
        await mongoose.connection.collection("bookingScheduleLocks").updateOne({ _id: adminId }, { $inc: { revision: 1 } }, { upsert: true, session });
        const overlap = await BookingModel.exists({ _id: { $ne: bookingId }, assignedAdminId: adminId, status: { $in: ["scheduled", "confirmed"] }, scheduledStartAt: { $lt: booking.scheduledEndAt }, scheduledEndAt: { $gt: start } }).session(session);
        if (overlap) throw new ConflictError("This appointment overlaps another scheduled call.");
        booking.timezone = data.timezone;
        booking.assignedAdminId = adminId;
        changedFields.push("scheduledStartAt", "scheduledEndAt", "timezone", "assignedAdminId");
      } else if (data.status === "confirmed") {
        if (!booking.scheduledStartAt || booking.scheduledStartAt <= new Date()) throw new ConflictError("The scheduled appointment is no longer valid.");
        booking.status = "confirmed";
      } else if (data.status === "completed") {
        booking.status = "completed";
        booking.completedAt = new Date();
      } else {
        booking.status = "cancelled";
        booking.cancelledAt = new Date();
        booking.cancellationReason = data.cancellationReason;
        changedFields.push("cancellationReason", "cancelledAt");
      }
      if (data.adminNotes !== undefined) {
        booking.adminNotes = data.adminNotes;
        changedFields.push("adminNotes");
      }
      await booking.save({ session });
      await AuditLogModel.create([{
        actorType: "admin", actorUserId: adminId,
        action: `booking.${data.status}`, targetType: "booking", targetId: booking._id.toString(), changedFields,
      }], { session });
      await OutboxEventModel.create([{
        eventType: "booking_status", aggregateType: "booking", aggregateId: booking._id,
        dedupeKey: `booking-status:${booking._id.toString()}:${randomUUID()}`,
        payload: { userId: booking.userId, orderId: booking.orderId, purchaseId: booking.purchaseId, bookingId: booking._id },
        status: "pending", attemptCount: 0, nextAttemptAt: new Date(),
      }], { session });
      updated = booking as unknown as Booking & { _id: Types.ObjectId };
    });
  } finally {
    await session.endSession();
  }
  if (!updated) throw new ConflictError();
  return toCustomerBookingView(updated);
}
