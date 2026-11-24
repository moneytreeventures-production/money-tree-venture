import "server-only";

import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { ConflictError, NotFoundError, ValidationError } from "../errors/app-error";
import { connectToDatabase } from "../db/mongodb";
import { ProductMediaModel, ProductModel, type ProductMedia } from "../db/models";
import { updateProduct } from "./product-service";
import { getPublicMediaConfiguration } from "../storage/public-media-config";
import { getPublicMediaStorage, validateProductMediaDescriptor, type ProductMediaKind, type PublicMediaStorage } from "../storage/public-media";

interface StoredMediaRecord extends ProductMedia {
  _id: Types.ObjectId;
  save(): Promise<unknown>;
}

export interface ProductMediaServiceDependencies {
  connect(): Promise<unknown>;
  configuration(): ReturnType<typeof getPublicMediaConfiguration>;
  storage: PublicMediaStorage;
  findProduct(id: string): Promise<{ _id: Types.ObjectId; publicationStatus: string; imageRefs: string[] } | null>;
  createMedia(input: Partial<ProductMedia> & { _id?: Types.ObjectId }): Promise<StoredMediaRecord>;
  findMedia(filter: Record<string, unknown>): Promise<StoredMediaRecord | null>;
  listMedia(productId: string): Promise<StoredMediaRecord[]>;
  updateProductMedia(productId: string, kind: ProductMediaKind, url: string | null, adminId: string): Promise<unknown>;
}

export function createProductMediaService(dependencies: ProductMediaServiceDependencies) {
  async function requireProduct(productId: string, adminId: string) {
    if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(adminId)) throw new ValidationError([{ field: "productId", message: "Product or administrator ID is invalid." }]);
    const product = await dependencies.findProduct(productId);
    if (!product) throw new NotFoundError();
    if (product.publicationStatus === "archived") throw new ConflictError();
    return product;
  }

  return {
    async beginUpload(productId: string, adminId: string, input: unknown) {
      await dependencies.connect();
      await requireProduct(productId, adminId);
      if (!input || typeof input !== "object") throw new ValidationError([{ field: "media", message: "Media upload details are required." }]);
      const value = input as Record<string, unknown>;
      if ((value.kind !== "thumbnail" && value.kind !== "promotional_video") || typeof value.fileName !== "string" || typeof value.contentType !== "string" || typeof value.sizeBytes !== "number") throw new ValidationError([{ field: "media", message: "Media upload details are invalid." }]);
      const kind = value.kind as ProductMediaKind;
      const config = dependencies.configuration();
      const descriptor = validateProductMediaDescriptor({ kind, fileName: value.fileName, contentType: value.contentType, sizeBytes: value.sizeBytes }, config);
      const mediaId = new Types.ObjectId();
      const uploadId = randomUUID();
      const stagingObjectKey = `pending/${productId}/${uploadId}.upload`;
      const objectKey = `products/${productId}/${randomUUID()}.${descriptor.extension}`;
      const media = await dependencies.createMedia({
        _id: mediaId,
        productId: new Types.ObjectId(productId),
        uploadId,
        kind,
        status: "uploading",
        stagingObjectKey,
        objectKey,
        originalFileName: value.fileName.normalize("NFC").trim(),
        contentType: descriptor.contentType,
        declaredSizeBytes: value.sizeBytes,
        uploadedBy: new Types.ObjectId(adminId),
      });
      try {
        const uploadUrl = await dependencies.storage.createUploadUrl({ objectKey: stagingObjectKey, contentType: descriptor.contentType });
        return { mediaId: String(media._id), uploadUrl, headers: { "Content-Type": descriptor.contentType } };
      } catch (error) {
        media.status = "failed";
        await media.save();
        throw error;
      }
    },

    async completeUpload(productId: string, mediaId: string, adminId: string) {
      await dependencies.connect();
      await requireProduct(productId, adminId);
      if (!Types.ObjectId.isValid(mediaId)) throw new ValidationError([{ field: "mediaId", message: "Media upload reference is invalid." }]);
      const media = await dependencies.findMedia({ _id: mediaId, productId, uploadedBy: adminId });
      if (!media) throw new NotFoundError();
      if (media.status !== "uploading") throw new ConflictError();
      const descriptor = validateProductMediaDescriptor({ kind: media.kind, fileName: media.originalFileName, contentType: media.contentType, sizeBytes: media.declaredSizeBytes }, dependencies.configuration());
      let published: Awaited<ReturnType<PublicMediaStorage["validateAndPublish"]>> | undefined;
      try {
        published = await dependencies.storage.validateAndPublish({ stagingKey: media.stagingObjectKey, objectKey: media.objectKey!, kind: media.kind, contentType: descriptor.contentType, expectedBytes: media.declaredSizeBytes, maximumBytes: descriptor.maximumBytes, publicUrlKey: String(media._id) });
        media.status = "ready";
        media.sizeBytes = published.sizeBytes;
        media.publicUrl = published.publicUrl;
        media.width = published.width;
        media.height = published.height;
        await media.save();
        await dependencies.updateProductMedia(productId, media.kind, published.publicUrl, adminId);
        return { id: String(media._id), kind: media.kind, publicUrl: media.publicUrl, sizeBytes: media.sizeBytes, width: media.width, height: media.height };
      } catch (error) {
        media.status = "failed";
        await media.save().catch(() => undefined);
        if (published) await dependencies.storage.deletePublicObject(media.objectKey!).catch(() => undefined);
        await dependencies.storage.deleteStagingObject(media.stagingObjectKey).catch(() => undefined);
        throw error;
      }
    },

    async list(productId: string, adminId: string) {
      await dependencies.connect();
      await requireProduct(productId, adminId);
      const records = await dependencies.listMedia(productId);
      return records.map((media) => ({ id: String(media._id), kind: media.kind, status: media.status, fileName: media.originalFileName, contentType: media.contentType, sizeBytes: media.sizeBytes ?? media.declaredSizeBytes, publicUrl: media.status === "ready" ? media.publicUrl : undefined, createdAt: media.createdAt }));
    },

    async setMedia(productId: string, adminId: string, kind: ProductMediaKind, mediaId: string | null) {
      await dependencies.connect();
      const product = await requireProduct(productId, adminId);
      let url: string | null = null;
      if (mediaId) {
        if (!Types.ObjectId.isValid(mediaId)) throw new ValidationError([{ field: "mediaId", message: "Media reference is invalid." }]);
        const media = await dependencies.findMedia({ _id: mediaId, productId, kind, status: "ready" });
        if (!media?.publicUrl) throw new NotFoundError();
        url = media.publicUrl;
      }
      if (kind === "thumbnail" && !mediaId && (!Array.isArray(product.imageRefs) || product.imageRefs.length === 0)) return product;
      return dependencies.updateProductMedia(productId, kind, url, adminId);
    },
  };
}

const productMediaService = createProductMediaService({
  connect: connectToDatabase,
  configuration: getPublicMediaConfiguration,
  storage: getPublicMediaStorage(),
  findProduct: async (id) => ProductModel.findById(id).select("_id publicationStatus imageRefs").lean().exec() as never,
  createMedia: async (input) => { const media = new ProductMediaModel(input); await media.save(); return media as unknown as StoredMediaRecord; },
  findMedia: async (filter) => await ProductMediaModel.findOne(filter) as unknown as StoredMediaRecord | null,
  listMedia: async (productId) => await ProductMediaModel.find({ productId }).sort({ createdAt: -1 }).limit(50) as unknown as StoredMediaRecord[],
  updateProductMedia: async (productId, kind, url, adminId) => {
    const product = await ProductModel.findById(productId).lean().exec();
    if (!product) throw new NotFoundError();
    const currentImageRefs = Array.isArray(product.imageRefs) ? product.imageRefs : [];
    const imageRefs = kind === "thumbnail"
      ? url ? [url, ...currentImageRefs.filter((ref) => ref !== url).slice(0, 19)] : currentImageRefs.slice(1)
      : undefined;
    return updateProduct(productId, kind === "thumbnail" ? { imageRefs } : { promotionalVideoUrl: url }, adminId);
  },
});

export const beginProductMediaUpload = productMediaService.beginUpload;
export const completeProductMediaUpload = productMediaService.completeUpload;
export const listProductMedia = productMediaService.list;
export const setProductMedia = productMediaService.setMedia;
