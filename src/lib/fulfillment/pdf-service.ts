import "server-only";

import { requireVerifiedPdfPurchase, matchesPurchasedPdf } from "./pdf-access";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { connectToDatabase } from "../db/mongodb";
import { OrderModel, ProductAssetModel, PersonalizedPdfModel, PurchaseModel, OutboxEventModel } from "../db/models";
import { ConflictError, NotFoundError, ValidationError } from "../errors/app-error";
import { logger } from "../logger";
import { getR2Storage } from "../storage/r2/client";
import { personalizePdf, PDF_WATERMARK_VERSION, UnsupportedWatermarkCharactersError } from "./pdf-personalization";
import { hasMatchingPdfSha256 } from "./pdf-integrity";
import { activePaidOrderFilter } from "./entitlement-policy";

function objectId(value: string, field: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ValidationError([{ field, message: "This resource reference is invalid." }]);
  return new Types.ObjectId(value);
}

/** Generate each copy from the immutable master snapshot; retries overwrite only that buyer's private key. */
export async function processPurchasePdfPersonalization(purchaseIdValue: string, customerIdValue: string) {
  await connectToDatabase();
  const purchaseId = objectId(purchaseIdValue, "purchaseId");
  const userId = objectId(customerIdValue, "userId");
  const purchase = await PurchaseModel.findOne({ _id: purchaseId, userId, accessStatus: "active", entitlementType: "download" }).lean().exec();
  if (!purchase) throw new NotFoundError();
  const order = await OrderModel.findOne({ _id: purchase.orderId, userId, ...activePaidOrderFilter() }).lean().exec();
  if (!order) throw new ConflictError();
  const verified = await requireVerifiedPdfPurchase(purchaseId, userId);
  const copies = await PersonalizedPdfModel.find({ purchaseId, userId, status: { $in: ["pending", "failed"] } }).lean().exec();
  if (!copies.length) {
    return PersonalizedPdfModel.find({ purchaseId, userId, status: "ready" }).lean().exec();
  }

  const assets = await ProductAssetModel.find({ _id: { $in: copies.map((copy) => copy.sourceAssetId) } }).lean().exec();
  const assetById = new Map(assets.map((asset) => [asset._id.toString(), asset]));
  const storage = getR2Storage();
  for (const copy of copies) {
    const asset = assetById.get(copy.sourceAssetId.toString());
    if (!matchesPurchasedPdf(verified.sources, copy, purchaseId) || !asset || !asset.productId.equals(copy.productId) || asset.version !== copy.sourceAssetVersion) {
      await PersonalizedPdfModel.updateOne({ _id: copy._id, userId, status: { $in: ["pending", "failed"] } }, { $set: { status: "failed", failureCode: "SOURCE_ASSET_MISMATCH" } });
      throw new ConflictError();
    }
    try {
      const master = await storage.getPrivatePdf(asset.objectKey);
      if (!hasMatchingPdfSha256(master, asset.sha256)) throw new ConflictError();
      const personalized = await personalizePdf(master, {
        buyerName: order.customerSnapshot.name,
        registeredEmail: order.customerSnapshot.email,
        orderReference: order.orderReference,
        purchaseDate: order.paidAt ?? purchase.grantedAt,
      });
      const sha256 = createHash("sha256").update(personalized).digest("hex");
      await storage.upload({
        objectKey: copy.objectKey,
        body: personalized,
        originalFileName: `buyer-copy-${copy._id.toString()}.pdf`,
        contentType: "application/pdf",
        metadata: { assetId: copy.sourceAssetId.toString(), productId: copy.productId.toString(), version: copy.sourceAssetVersion },
      });
      const result = await PersonalizedPdfModel.updateOne({ _id: copy._id, userId, status: { $in: ["pending", "failed"] } }, {
        $set: { status: "ready", sizeBytes: personalized.byteLength, sha256, generatedAt: new Date(), watermarkVersion: PDF_WATERMARK_VERSION },
        $unset: { failureCode: 1 },
      });
      if (result.matchedCount !== 1) throw new ConflictError();
    } catch (error) {
      logger.error("pdf.personalization.failed", {
        purchaseId: purchaseId.toString(),
        personalizedPdfId: copy._id.toString(),
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      await PersonalizedPdfModel.updateOne({ _id: copy._id, userId, status: { $in: ["pending", "failed"] } }, {
        $set: { status: "failed", failureCode: error instanceof UnsupportedWatermarkCharactersError
          ? error.code
          : error instanceof ConflictError ? "FULFILLMENT_CONFLICT" : "PDF_GENERATION_FAILED" },
      });
      throw error;
    }
  }

  await OutboxEventModel.updateOne({ dedupeKey: `pdf-personalization:${purchaseId.toString()}`, status: { $in: ["pending", "retry"] } }, {
    $set: { status: "sent", processedAt: new Date() },
  });
  return PersonalizedPdfModel.find({ purchaseId, userId, status: "ready" }).lean().exec();
}
