import "server-only";

import { createHash, randomUUID } from "node:crypto";
import mongoose, { Types, type QueryFilter } from "mongoose";
import { z } from "zod";
import { getServerEnv } from "../env/server";
import { connectToDatabase } from "../db/mongodb";
import { AuditLogModel, BookingModel, CheckoutClaimModel, CouponModel, CouponRedemptionModel, OrderModel, PaymentModel, PurchaseModel, RefundModel, ProductAssetModel, ProductModel, type Order, type Product } from "../db/models";
import { ApplicationError, IntegrationConfigurationError, NotFoundError, ValidationError } from "../errors/app-error";
import { cartSchema } from "../cart/cart";
import { priceOrder } from "./pricing";
import { applyCouponProductRestrictions } from "../coupons/preview-pricing";
import { isOrderQuantityAllowed } from "./order-rules";
import { canExpireOrder } from "./order-lifecycle";
import { persistOrderLifecycleChanges } from "./order-state-persistence";
import { logger } from "../logger";

const checkoutSchema = z.object({
  items: cartSchema,
  couponCode: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).optional(),
  repurchaseProductIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(50).optional(),
}).strict();

type CheckoutInput = z.infer<typeof checkoutSchema>;
type ProductRecord = Product & { _id: Types.ObjectId };
interface OrderLineDraft {
  productId: Types.ObjectId; productName: string; productSlug: string; productType: Product["productType"];
  quantity: number; unitPricePaise: number; lineSubtotalPaise: number;
  includedProducts: Array<Record<string, unknown>>; discountEligible: boolean; categoryIds: Types.ObjectId[];
  asset?: ReturnType<typeof assetSnapshot>; bundleKind?: Product["bundleKind"];
  callDurationMinutes?: number; fulfilmentInstructions?: string;
}

export function validateCheckout(input: unknown): CheckoutInput {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const details = issues.map((issue) => ({ field: issue.path.map(String).join(".") || "checkout", message: issue.message }));
    if (issues.some((issue) => issue.path[0] === "couponCode")) throw new ValidationError(details);
    const duplicate = issues.some((issue) => issue.message === "A product can appear only once in the cart.");
    const quantity = issues.some((issue) => issue.path.at(-1) === "quantity");
    const empty = issues.some((issue) => issue.path.join(".") === "items" && issue.code === "too_small");
    throw new ApplicationError(duplicate ? "Each digital product can be purchased only once per order. Remove the duplicate from your cart." :
      quantity ? "Only one license per product is supported. Update your cart and try again." :
      empty ? "Your cart is empty. Add a product before checkout." :
      "Your cart contains invalid items. Refresh or correct your cart before checkout.", {
      code: duplicate ? "CART_DUPLICATE_ITEM" : quantity ? "CART_QUANTITY_INVALID" : empty ? "CART_EMPTY" : "CART_INVALID_ITEMS",
      statusCode: 400, details,
    });
  }
  return parsed.data;
}

export function assertRepurchaseAcknowledgement(items: CheckoutInput["items"], ownedProductIds: readonly string[], acknowledgedProductIds: readonly string[] = []): void {
  const owned = new Set(ownedProductIds.map((id) => id.toLowerCase()));
  const acknowledgedList = acknowledgedProductIds.map((id) => id.toLowerCase());
  const acknowledged = new Set(acknowledgedList);
  if (owned.size === acknowledged.size && acknowledgedList.length === acknowledged.size && [...owned].every((id) => acknowledged.has(id) && items.some((item) => item.productId.toLowerCase() === id))) return;
  throw new ApplicationError(owned.size ? "You already own a product in this cart. You can download it again from My Library without paying. Confirm Purchase Again for each owned product to continue." : "Repurchase confirmation no longer matches your cart. Refresh checkout and try again.", { code: owned.size ? "REPURCHASE_CONFIRMATION_REQUIRED" : "REPURCHASE_CONFIRMATION_STALE", statusCode: 409,
    details: items.flatMap((item, index) => owned.has(item.productId.toLowerCase()) ? [{ field: `items.${index}.productId`, message: "Repurchase confirmation is required." }] : []),
  });
}

/** Authenticated, read-only ownership and current-price preview for consent UI. */
export async function previewCheckoutOwnership(input: unknown, customerId: string) {
  const data = validateCheckout(input);
  const userId = validateUserId(customerId);
  await connectToDatabase();
  const ids = data.items.map((item) => new Types.ObjectId(item.productId));
  const [products, purchases] = await Promise.all([
    ProductModel.find({ _id: { $in: ids }, publicationStatus: "published" }).select("name pricePaise productType").lean().exec(),
    PurchaseModel.find({ userId, productId: { $in: ids }, accessStatus: "active" }).select("productId productType").lean().exec(),
  ]);
  if (products.length !== ids.length) throw new NotFoundError();
  const byId = new Map(products.map((product) => [product._id.toString().toLowerCase(), product]));
  return {
    products: data.items.map((item) => {
      const product = byId.get(item.productId.toLowerCase())!;
      return { productId: item.productId.toLowerCase(), name: product.name, pricePaise: product.pricePaise, productType: product.productType };
    }),
    ownedProductIds: [...new Set(purchases.map((purchase) => purchase.productId.toString().toLowerCase()))],
  };
}

function validateUserId(id: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new ValidationError([{ field: "userId", message: "Customer identity is invalid." }]);
  return new Types.ObjectId(id);
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === 11000 || error.code === "11000");
}

function orderConflict(code: "ORDER_RETRY_MISMATCH" | "ORDER_CREATE_COLLISION" | "ORDER_CREATION_INCOMPLETE", message: string): ApplicationError {
  return new ApplicationError(message, { code, statusCode: 409 });
}

function assetSnapshot(asset: { _id: Types.ObjectId; version: string; sha256?: string }) {
  return { assetId: asset._id, version: asset.version, ...(asset.sha256 ? { sha256: asset.sha256 } : {}) };
}

function hashCheckout(input: CheckoutInput): string {
  const canonical = JSON.stringify({
    items: input.items.map(({ productId, quantity }) => ({ productId: productId.toLowerCase(), quantity })),
    couponCode: input.couponCode?.trim().toUpperCase() ?? null,
    repurchaseProductIds: [...(input.repurchaseProductIds ?? [])].map((id) => id.toLowerCase()).sort(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

type StoredOrder = Record<string, unknown> & { lines?: unknown[]; _id?: Types.ObjectId | string };

export interface CustomerOrderView {
  id?: string;
  orderReference: string;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: "INR";
  couponSnapshot?: { code?: string; discountPaise?: number };
  lines: Array<{
    productId: string; productName: string; productSlug: string; productType: string; quantity: number;
    unitPricePaise: number; lineSubtotalPaise: number; discountPaise: number; taxPaise: number; lineTotalPaise: number;
    bundleKind?: string; includedProducts: Array<{ name: string; slug: string }>;
    callDurationMinutes?: number; fulfilmentInstructions?: string;
  }>;
  orderStatus: "awaiting_payment" | "paid" | "expired" | "cancelled" | "partially_refunded" | "refunded";
  paymentStatus: "unpaid" | "pending" | "paid" | "failed" | "partially_refunded" | "refunded";
  paymentExpired: boolean;
  archivedAt?: Date | string;
  createdAt?: Date | string;
}

/** Customer responses deliberately omit internal IDs for private master and included PDF assets. */
export function toCustomerOrderView(order: StoredOrder): CustomerOrderView {
  const lines = Array.isArray(order.lines) ? order.lines : [];
  return {
    id: order._id?.toString(),
    orderReference: order.orderReference,
    lines: lines.map((value) => {
      const line = value as Record<string, unknown>;
      const included = Array.isArray(line.includedProducts) ? line.includedProducts : [];
      return {
        productId: line.productId?.toString(),
        productName: line.productName,
        productSlug: line.productSlug,
        productType: line.productType,
        ...(line.bundleKind ? { bundleKind: line.bundleKind } : {}),
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        lineSubtotalPaise: line.lineSubtotalPaise,
        discountPaise: line.discountPaise,
        taxPaise: line.taxPaise,
        lineTotalPaise: line.lineTotalPaise,
        ...(line.callDurationMinutes ? { callDurationMinutes: line.callDurationMinutes } : {}),
        ...(line.fulfilmentInstructions && ["paid", "partially_refunded"].includes(String(order.orderStatus)) && ["paid", "partially_refunded"].includes(String(order.paymentStatus))
          ? { fulfilmentInstructions: line.fulfilmentInstructions } : {}),
        includedProducts: included.map((item) => {
          const product = item as Record<string, unknown>;
          return { name: product.name, slug: product.slug };
        }),
      };
    }),
    subtotalPaise: order.subtotalPaise,
    discountPaise: order.discountPaise,
    taxPaise: order.taxPaise,
    totalPaise: order.totalPaise,
    currency: order.currency,
    ...(order.couponSnapshot ? {
      couponSnapshot: {
        ...(typeof order.couponSnapshot === "object" && "code" in order.couponSnapshot ? { code: order.couponSnapshot.code } : {}),
        ...(typeof order.couponSnapshot === "object" && "discountPaise" in order.couponSnapshot ? { discountPaise: order.couponSnapshot.discountPaise } : {}),
      },
    } : {}),
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paymentExpired: order.expiresAt instanceof Date && order.expiresAt <= new Date(),
    paidAt: order.paidAt,
    refundedAt: order.refundedAt,
    archivedAt: order.archivedAt,
  } as CustomerOrderView;
}

async function findOrderForIdempotency(userId: Types.ObjectId, key: string) {
  return OrderModel.findOne({ userId, checkoutIdempotencyKey: key })
    .select("+checkoutRequestHash")
    .lean()
    .exec() as Promise<(Record<string, unknown> & { checkoutRequestHash?: string }) | null>;
}

/** Finalize expired orders only after no unresolved payment attempt can still settle. */
export async function expireOrderIfSettled(orderId: Types.ObjectId, userId: Types.ObjectId): Promise<void> {
  const expirationCandidate = await OrderModel.findOne({
    _id: orderId, userId, orderStatus: "awaiting_payment", expiresAt: { $lte: new Date() },
    paymentStatus: { $in: ["unpaid", "failed"] },
  }).select("_id").lean().exec();
  if (!expirationCandidate) return;
  const session = await mongoose.connection.getClient().startSession();
  try {
    await session.withTransaction(async () => {
      const order = await OrderModel.findOne({ _id: orderId, userId }).session(session);
      if (!order) return;
      const expected = { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}) };
      const now = new Date();
      const unsafeAttempt = await PaymentModel.countDocuments({ orderId, $or: [
        { status: { $nin: ["failed", "interrupted"] } },
        { providerStatus: { $nin: ["FAILED", "USER_DROPPED", "NOT_ATTEMPTED", "EXPIRED_NO_ATTEMPT"] } },
      ] }).session(session) > 0;
      const dependent = await PurchaseModel.exists({ orderId }).session(session) || await RefundModel.exists({ orderId }).session(session);
      const hasPendingPaymentAttempt = unsafeAttempt || Boolean(dependent);
      if (!canExpireOrder({ orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, expiresAt: order.expiresAt, hasPendingPaymentAttempt, now })) return;
      order.orderStatus = "expired";
      await CheckoutClaimModel.updateMany({ orderId, userId, status: "active" }, { $set: { status: "released", releasedAt: now } }, { session });
      await persistOrderLifecycleChanges({ orderId, userId, session, expected, changes: { orderStatus: "expired" } });
      if (order.couponSnapshot?.couponId) {
        const redemption = await CouponRedemptionModel.findOne({ couponId: order.couponSnapshot.couponId, orderId }).session(session);
        if (redemption?.status === "reserved") {
          redemption.status = "released";
          redemption.releasedAt = now;
          await redemption.save({ session });
        }
      }
      await AuditLogModel.create([{
        actorType: "system", action: "order.payment_window_expired", targetType: "order", targetId: order._id.toString(),
        changedFields: order.couponSnapshot?.couponId ? ["orderStatus", "couponReservation"] : ["orderStatus"],
        reason: "The order expired after its payment window with no unresolved payment attempt; its coupon reservation was released.",
      }], { session });
    });
  } finally { await session.endSession(); }
}

/** Create an immutable, authenticated order. This function does not contact Cashfree. */
export async function createOrder(input: unknown, customer: { id: string; name: string; email: string }, idempotencyKey: string) {
  const data = validateCheckout(input);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new ValidationError([{ field: "idempotencyKey", message: "A valid checkout idempotency key is required." }]);
  }
  const userId = validateUserId(customer.id);
  const requestHash = hashCheckout(data);
  await connectToDatabase();

  const previous = await findOrderForIdempotency(userId, idempotencyKey);
  if (previous) {
    if (previous.checkoutRequestHash !== requestHash) {
      throw orderConflict("ORDER_RETRY_MISMATCH", "This checkout attempt belongs to a different cart. Review your cart and try again.");
    }
    return toCustomerOrderView(previous);
  }

  const env = getServerEnv();
  // New orders carry a zero-tax compatibility snapshot; historical snapshots remain unchanged.
  const taxRateBps = 0;
  const gatewayEnvironment = env.CASHFREE_ENVIRONMENT ?? (env.NODE_ENV === "production" ? undefined : "sandbox");
  if (!gatewayEnvironment) throw new IntegrationConfigurationError("Cashfree", ["CASHFREE_ENVIRONMENT"]);

  if (!await CheckoutClaimModel.collection.indexExists("checkout_claim_one_active_product")) throw new IntegrationConfigurationError("MongoDB", ["checkout_claim_one_active_product"]);
  const requestedIds = data.items.map((item) => new Types.ObjectId(item.productId));
  const now = new Date();
  const session = await mongoose.connection.getClient().startSession();
  let created: InstanceType<typeof OrderModel> | undefined;
  try {
    await session.withTransaction(async () => {
      const products = await ProductModel.find({ _id: { $in: requestedIds }, publicationStatus: "published" })
        .session(session).lean().exec() as unknown as ProductRecord[];
      if (products.length !== requestedIds.length) throw new NotFoundError();
      const legacyOpen = await OrderModel.exists({ userId, orderStatus: "awaiting_payment", "lines.productId": { $in: requestedIds } }).session(session);
      if (legacyOpen) throw new ApplicationError("An earlier payment for a product in your cart is still being processed. Check your order status before trying again.", { code: "ACTIVE_CHECKOUT", statusCode: 409 });
      const owned = await PurchaseModel.find({ userId, productId: { $in: requestedIds }, accessStatus: "active" }).select("productId productType").session(session).lean().exec();
      if (owned.some((purchase) => purchase.productType === "call_guidance")) throw new ApplicationError("You already have access to this Call Guidance purchase. Open your account before creating another order.", { code: "ALREADY_PURCHASED", statusCode: 409 });
      const ownedIds = new Set(owned.map((purchase) => purchase.productId.toString().toLowerCase()));
      assertRepurchaseAcknowledgement(data.items, [...ownedIds], data.repurchaseProductIds);
      if (ownedIds.size && (await PurchaseModel.collection.indexExists("purchase_one_active_product_per_user") || !await PurchaseModel.collection.indexExists("purchase_user_product_history"))) {
        throw new IntegrationConfigurationError("MongoDB", ["purchase_user_product_history"]);
      }
      // Existing paid claims from before the policy change remain active until a
      // fully paid order with no unresolved payment attempt is verified here.
      const priorClaims = await CheckoutClaimModel.find({ userId, productId: { $in: requestedIds }, status: "active" }).session(session).lean().exec();
      for (const claim of priorClaims) {
        const settledOrder = await OrderModel.exists({ _id: claim.orderId, userId, orderStatus: "paid", paymentStatus: "paid" }).session(session);
        const unresolvedAttempt = await PaymentModel.exists({ orderId: claim.orderId, userId, status: "pending" }).session(session);
        if (!settledOrder || unresolvedAttempt) throw new ApplicationError("An earlier payment for a product in your cart is still being processed. Check your order status before trying again.", { code: "ACTIVE_CHECKOUT", statusCode: 409 });
        await CheckoutClaimModel.updateOne({ _id: claim._id, userId, status: "active" }, { $set: { status: "completed", completedAt: now } }, { session });
      }
      const byId = new Map(products.map((product) => [product._id.toString(), product]));
      const requestedProducts = data.items.map((item) => byId.get(item.productId.toLowerCase()));
      if (requestedProducts.some((product) => !product)) throw new NotFoundError();

      const pdfProducts = requestedProducts.flatMap((product) => product?.productType === "pdf" ? [product] : product?.productType === "pdf_bundle" ? product.includedProductIds.map((id) => ({ _id: id })) : []);
      const pdfIds = [...new Map(pdfProducts.map((product) => [product._id.toString(), product._id])).values()];
      const publishedPdfRecords = pdfIds.length
        ? await ProductModel.find({ _id: { $in: pdfIds }, productType: "pdf", publicationStatus: "published" }).session(session).lean().exec() as unknown as ProductRecord[]
        : [];
      if (publishedPdfRecords.length !== pdfIds.length) throw new NotFoundError();
      const publishedPdfMap = new Map(publishedPdfRecords.map((product) => [product._id.toString(), product]));
      const activeAssetIds = publishedPdfRecords.flatMap((product) => product.primaryAssetId ? [product.primaryAssetId] : []);
      const assets = activeAssetIds.length
        ? await ProductAssetModel.find({ _id: { $in: activeAssetIds }, status: "active" }).session(session).lean().exec() as unknown as Array<{ _id: Types.ObjectId; productId: Types.ObjectId; version: string; sha256?: string }>
        : [];
      const assetsById = new Map(assets.map((asset) => [asset._id.toString(), asset]));
      const verifiedAsset = (product: ProductRecord) => {
        const asset = product.primaryAssetId ? assetsById.get(product.primaryAssetId.toString()) : undefined;
        if (!asset || !asset.productId.equals(product._id)) throw new NotFoundError();
        return asset;
      };

      const lineDrafts: OrderLineDraft[] = requestedProducts.map((product, index) => {
        if (!product) throw new NotFoundError();
        const quantity = data.items[index]!.quantity;
        if (!isOrderQuantityAllowed(product.productType, quantity)) {
          throw new ValidationError([{ field: `items.${index}.quantity`, message: "Only one personal-use license per product is supported." }]);
        }
        const lineSubtotalPaise = product.pricePaise * quantity;
        if (!Number.isSafeInteger(lineSubtotalPaise)) throw new ValidationError([{ field: "items", message: "Order amount is outside the supported range." }]);
        const common = {
          productId: product._id, productName: product.name, productSlug: product.slug,
          productType: product.productType, quantity, unitPricePaise: product.pricePaise,
          lineSubtotalPaise, includedProducts: [] as Array<Record<string, unknown>>,
          discountEligible: true,
        };
        if (product.productType === "pdf") return { ...common, asset: assetSnapshot(verifiedAsset(product)), categoryIds: product.categoryIds };
        if (product.productType === "pdf_bundle") {
          const includedProducts = product.includedProductIds.map((id) => {
            const included = publishedPdfMap.get(id.toString());
            if (!included) throw new NotFoundError();
            const asset = verifiedAsset(included);
            return { productId: included._id, name: included.name, slug: included.slug, asset: assetSnapshot(asset) };
          });
          return { ...common, bundleKind: product.bundleKind, includedProducts, categoryIds: product.categoryIds };
        }
        if (!product.callDurationMinutes || !product.fulfilmentInstructions) throw new NotFoundError();
        return { ...common, callDurationMinutes: product.callDurationMinutes, fulfilmentInstructions: product.fulfilmentInstructions, categoryIds: product.categoryIds };
      });

      const subtotalPaise = lineDrafts.reduce((sum, line) => sum + line.lineSubtotalPaise, 0);
      if (!Number.isSafeInteger(subtotalPaise)) throw new ValidationError([{ field: "items", message: "Order amount is outside the supported range." }]);
      let coupon: { _id: Types.ObjectId; code: string; discountType: "fixed" | "percentage"; discountValue: number; maximumDiscountPaise?: number; minimumOrderPaise: number; totalRedemptionLimit?: number; perCustomerRedemptionLimit?: number; allowedProductIds: Types.ObjectId[]; allowedCategoryIds: Types.ObjectId[] } | undefined;
      if (data.couponCode) {
        coupon = await CouponModel.findOne({ code: data.couponCode.toUpperCase(), status: "active", validFrom: { $lte: now }, validUntil: { $gt: now } })
          .select("+reservationSequence")
          .session(session).lean().exec() as typeof coupon;
        if (!coupon || subtotalPaise < coupon.minimumOrderPaise) throw new ValidationError([{ field: "couponCode", message: "This coupon is unavailable or the order does not meet its minimum value." }]);
        await CouponModel.updateOne({ _id: coupon._id }, { $inc: { reservationSequence: 1 } }, { session });
      }

      const discountEligibility = coupon
        ? applyCouponProductRestrictions(lineDrafts, coupon)
        : lineDrafts.map((line) => ({ ...line, discountEligible: false }));
      if (coupon && !discountEligibility.some((line) => line.discountEligible)) {
        throw new ValidationError([{ field: "couponCode", message: "This coupon does not apply to the selected products." }]);
      }

      if (coupon) {
        const activeReservation = { status: "reserved", reservationExpiresAt: { $gt: now } };
        const redeemed = { status: "redeemed" };
        const totalUses = await CouponRedemptionModel.countDocuments({ couponId: coupon._id, $or: [activeReservation, redeemed] } as never).session(session);
        const customerUses = await CouponRedemptionModel.countDocuments({ couponId: coupon._id, userId, $or: [activeReservation, redeemed] } as never).session(session);
        if ((coupon.totalRedemptionLimit !== undefined && totalUses >= coupon.totalRedemptionLimit) ||
          (coupon.perCustomerRedemptionLimit !== undefined && customerUses >= coupon.perCustomerRedemptionLimit)) {
          throw new ValidationError([{ field: "couponCode", message: "This coupon has reached its usage limit." }]);
        }
      }

      const priced = priceOrder(discountEligibility, coupon ? {
        type: coupon.discountType, value: coupon.discountValue, ...(coupon.maximumDiscountPaise !== undefined ? { maximumDiscountPaise: coupon.maximumDiscountPaise } : {}),
      } : undefined, taxRateBps);
      const discountPaise = priced.reduce((sum, line) => sum + line.discountPaise, 0);
      const totalPaise = priced.reduce((sum, line) => sum + line.lineTotalPaise, 0);
      const taxPaise = priced.reduce((sum, line) => sum + line.taxPaise, 0);
      if (totalPaise <= 0) throw new ValidationError([{ field: "couponCode", message: "The order total must be greater than zero." }]);
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
      created = new OrderModel({
        orderReference: `MTV-${randomUUID().replaceAll("-", "").toUpperCase()}`,
        userId,
        gatewayEnvironment,
        customerSnapshot: { name: customer.name, email: customer.email.toLowerCase() },
        lines: priced.map((line, index) => {
          const source = lineDrafts[index]!;
          return {
            productId: source.productId, productName: source.productName, productSlug: source.productSlug,
            productType: source.productType, quantity: source.quantity, unitPricePaise: source.unitPricePaise,
            lineSubtotalPaise: source.lineSubtotalPaise, discountPaise: line.discountPaise,
            taxPaise: line.taxPaise, lineTotalPaise: line.lineTotalPaise,
            ...(source.asset ? { asset: source.asset } : {}),
            includedProducts: source.includedProducts,
            ...(source.bundleKind ? { bundleKind: source.bundleKind } : {}),
            ...(source.callDurationMinutes ? { callDurationMinutes: source.callDurationMinutes } : {}),
            ...(source.fulfilmentInstructions ? { fulfilmentInstructions: source.fulfilmentInstructions } : {}),
          };
        }),
        subtotalPaise, discountPaise, taxPaise, totalPaise, currency: "INR",
        taxSnapshot: { rateBasisPoints: 0, calculationVersion: "no-tax-v1" },
        ...(coupon ? { couponSnapshot: { couponId: coupon._id, code: coupon.code, discountPaise } } : {}),
        checkoutIdempotencyKey: idempotencyKey,
        checkoutRequestHash: requestHash,
        orderStatus: "awaiting_payment", paymentStatus: "unpaid", expiresAt,
      });
      await created.save({ session });
      await CheckoutClaimModel.create(requestedIds.map((productId) => ({ userId, productId, orderId: created!._id, status: "active" })), { session });
      if (coupon) {
        await CouponRedemptionModel.create([{
          couponId: coupon._id, userId, orderId: created._id, discountPaise,
          status: "reserved", reservedAt: now, reservationExpiresAt: expiresAt,
        }], { session });
      }
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const claim = await CheckoutClaimModel.findOne({ userId, productId: { $in: data.items.map((item) => new Types.ObjectId(item.productId)) }, status: "active" }).lean().exec();
      if (claim && claim.orderId.toString() !== created?._id.toString()) throw new ApplicationError("An earlier payment for a product in your cart is still being processed. Check your order status before trying again.", { code: "ACTIVE_CHECKOUT", statusCode: 409 });
      const retry = await findOrderForIdempotency(userId, idempotencyKey);
      if (retry?.checkoutRequestHash === requestHash) return toCustomerOrderView(retry);
      if (retry) throw orderConflict("ORDER_RETRY_MISMATCH", "This checkout attempt belongs to a different cart. Review your cart and try again.");
      const keyPattern = typeof error === "object" && error !== null && "keyPattern" in error ? error.keyPattern : undefined;
      const indexFields = keyPattern && typeof keyPattern === "object"
        ? Object.keys(keyPattern).filter((field) => /^[A-Za-z][A-Za-z0-9_.]{0,79}$/.test(field)).slice(0, 8)
        : [];
      logger.warn("checkout.order_unique_index_collision", { indexFields });
      throw orderConflict("ORDER_CREATE_COLLISION", "This order could not be created because another checkout update occurred. Please try again.");
    }
    throw error;
  } finally {
    await session.endSession();
  }
  if (!created) throw orderConflict("ORDER_CREATION_INCOMPLETE", "This order could not be created. Please try again.");
  return toCustomerOrderView(created.toObject() as unknown as StoredOrder);
}

export async function listCustomerOrders(customerId: string) {
  await connectToDatabase();
  const userId = validateUserId(customerId);
  await settleOverdueCustomerOrders(userId);
  const orders = await OrderModel.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(50).lean().exec();
  return orders.map((order) => toCustomerOrderView(order as unknown as StoredOrder));
}

export type OrderHistoryTab = "all" | "processing" | "completed" | "closed" | "archived";

export function orderHistoryFilter(userId: Types.ObjectId, tab: OrderHistoryTab): QueryFilter<Order> {
  const archive = tab === "archived" ? { archivedAt: { $exists: true } } : { archivedAt: { $exists: false } };
  if (tab === "completed") return { userId, ...archive, orderStatus: "paid", paymentStatus: "paid" };
  if (tab === "processing") return { userId, ...archive, $or: [
    { paymentStatus: "pending" }, { orderStatus: "awaiting_payment", paymentStatus: "unpaid" },
    { orderStatus: "partially_refunded", paymentStatus: "partially_refunded" },
  ] };
  if (tab === "closed") return { userId, ...archive, paymentStatus: { $ne: "pending" }, $or: [
    { orderStatus: { $in: ["expired", "cancelled", "refunded"] } },
    { paymentStatus: { $in: ["failed", "refunded"] } },
  ] };
  return { userId, ...archive };
}

async function settleOverdueCustomerOrders(userId: Types.ObjectId) {
  const overdue = await OrderModel.find({ userId, orderStatus: "awaiting_payment", paymentStatus: "unpaid", expiresAt: { $lte: new Date() } }).select("_id").sort({ _id: 1 }).limit(10).lean().exec();
  for (const candidate of overdue) if (!await PaymentModel.exists({ orderId: candidate._id })) await expireOrderIfSettled(candidate._id, userId);
}

export async function listCustomerOrderPage(customerId: string, tab: OrderHistoryTab, page: number, pageSize = 12) {
  if (!Number.isInteger(page) || page < 1 || page > 100_000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new ValidationError([{ field: "page", message: "Order page is invalid." }]);
  }
  await connectToDatabase();
  const userId = validateUserId(customerId);
  await settleOverdueCustomerOrders(userId);
  const filter = orderHistoryFilter(userId, tab);
  const [orders, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
    OrderModel.countDocuments(filter),
  ]);
  return { items: orders.map((order) => toCustomerOrderView(order as unknown as StoredOrder)), page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
}

export async function getCustomerAccountOverview(customerId: string) {
  await connectToDatabase();
  const userId = validateUserId(customerId);
  await settleOverdueCustomerOrders(userId);
  const [productIds, completedOrders, processingOrders, bookingCount, recentOrders] = await Promise.all([
    PurchaseModel.distinct("productId", { userId, accessStatus: "active", entitlementType: "download" }),
    OrderModel.countDocuments(orderHistoryFilter(userId, "completed")),
    OrderModel.countDocuments(orderHistoryFilter(userId, "processing")),
    BookingModel.countDocuments({ userId }),
    OrderModel.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(3).lean().exec(),
  ]);
  return { purchasedProducts: productIds.length, completedOrders, processingOrders, bookingCount,
    recentOrders: recentOrders.map((order) => toCustomerOrderView(order as unknown as StoredOrder)) };
}

export async function setCustomerOrderArchived(orderId: string, customerId: string, archived: boolean) {
  await connectToDatabase();
  const userId = validateUserId(customerId);
  if (!/^[a-f0-9]{24}$/i.test(orderId)) throw new ValidationError([{ field: "orderId", message: "Order reference is invalid." }]);
  const id = new Types.ObjectId(orderId);
  const result = archived
    ? await OrderModel.updateOne({ _id: id, userId }, { $set: { archivedAt: new Date() } }, { runValidators: true })
    : await OrderModel.updateOne({ _id: id, userId }, { $unset: { archivedAt: "" } }, { runValidators: true });
  if (result.matchedCount !== 1) throw new NotFoundError();
  return { archived };
}

export async function getCustomerOrder(orderId: string, customerId: string) {
  await connectToDatabase();
  const userId = validateUserId(customerId);
  if (!/^[a-f0-9]{24}$/i.test(orderId)) throw new ValidationError([{ field: "orderId", message: "Order reference is invalid." }]);
  const id = new Types.ObjectId(orderId);
  // A missed localhost webhook or closed return page must not leave a single
  // unresolved order stale forever. This is limited to the requested owner's
  // order and uses the existing server-verified reconciliation path.
  const unresolved = await OrderModel.findOne({ _id: id, userId, paymentStatus: { $in: ["pending", "failed"] } })
    .select("_id").lean().exec();
  if (unresolved && await PaymentModel.exists({ orderId: id, userId, cashfreeOrderId: { $type: "string" } })) {
    try {
      const { getVerifiedPaymentStatus } = await import("../payments/cashfree/payment-service");
      await getVerifiedPaymentStatus(orderId, customerId);
    } catch {
      // Preserve the order view when the provider is temporarily unavailable.
      // Its state remains inconclusive until another verified reconciliation.
    }
  }
  await expireOrderIfSettled(id, userId);
  const order = await OrderModel.findOne({ _id: id, userId }).lean().exec();
  if (!order) throw new NotFoundError();
  return toCustomerOrderView(order as unknown as StoredOrder);
}
