import "server-only";

import { createHash, randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { ConflictError, NotFoundError, ValidationError } from "../errors/app-error";
import { connectToDatabase } from "../db/mongodb";
import { AuditLogModel, ProductAssetModel, ProductModel } from "../db/models";
import { getR2Configuration } from "../storage/config";
import { getR2Storage } from "../storage/r2/client";
import { assertReadablePdfDocument, createPrivatePdfObjectKey } from "../storage/validation";

export async function listProductAssets(productId: string) {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(productId)) throw new ValidationError([{ field: "productId", message: "Invalid product ID." }]);
  if (!await ProductModel.exists({ _id: productId })) throw new NotFoundError();
  const assets = await ProductAssetModel.find({ productId }).sort({ createdAt: -1 }).select("_id version originalFileName sizeBytes mimeType sha256 status createdAt").lean().exec();
  return assets.map((asset) => ({ id: String(asset._id), version: asset.version, fileName: asset.originalFileName, sizeBytes: asset.sizeBytes, mimeType: asset.mimeType, sha256: asset.sha256, status: asset.status, createdAt: asset.createdAt }));
}

export async function uploadProductPdf(productId: string, file: File, adminUserId: string) {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(adminUserId)) throw new ValidationError([{ field: "productId", message: "Product or administrator ID is invalid." }]);
  const product = await ProductModel.findById(productId);
  if (!product) throw new NotFoundError();
  if (product.productType !== "pdf" || product.publicationStatus === "archived") throw new ConflictError();
  const maximumBytes = getR2Configuration().maxUploadBytes;
  if (file.type !== "application/pdf" || file.size < 5 || file.size > maximumBytes || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new ValidationError([{ field: "file", message: "PDF file select karein, jo configured size limit ke andar ho." }]);
  }
  const body = new Uint8Array(await file.arrayBuffer());
  if (body.byteLength < 5 || body.byteLength > maximumBytes || Buffer.from(body.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new ValidationError([{ field: "file", message: "Valid PDF file select karein." }]);
  }
  await assertReadablePdfDocument(body);

  const assetId = new Types.ObjectId();
  const version = randomUUID();
  const objectKey = createPrivatePdfObjectKey("masters", assetId.toString());
  const sha256 = createHash("sha256").update(body).digest("hex");
  const storage = getR2Storage();
  await storage.upload({ objectKey, body, originalFileName: file.name, contentType: "application/pdf", metadata: { assetId: assetId.toString(), productId, version } });
  const session = mongoose.connection.getClient().startSession();
  try {
    await session.withTransaction(async () => {
      const freshProduct = await ProductModel.findById(productId).session(session);
      if (!freshProduct || freshProduct.productType !== "pdf" || freshProduct.publicationStatus === "archived") throw new ConflictError();
      await ProductAssetModel.updateMany({ productId, status: "active" }, { $set: { status: "superseded" } }, { session });
      await ProductAssetModel.create([{
        _id: assetId, productId, objectKey, version, originalFileName: file.name, sizeBytes: body.byteLength,
        mimeType: "application/pdf", sha256, status: "active", copyrightNoticeVersion: "personal-use-v1", uploadedBy: new Types.ObjectId(adminUserId),
      }], { session });
      freshProduct.primaryAssetId = assetId;
      await freshProduct.save({ session });
      await AuditLogModel.create([{
        actorType: "admin", actorUserId: new Types.ObjectId(adminUserId), action: "product.pdf_uploaded", targetType: "product",
        targetId: productId, changedFields: ["primaryAssetId", "productAsset"],
      }], { session });
    });
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    throw error;
  } finally {
    await session.endSession();
  }
  return { id: assetId.toString(), version, fileName: file.name, sizeBytes: body.byteLength, sha256, status: "active" as const };
}
