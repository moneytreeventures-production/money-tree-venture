import type { Types } from "mongoose";
import type { OrderLine } from "../db/models/order";

/** Orders remain entitled while a full refund is processing; revocation is atomic on verified success. */
export function activePaidOrderFilter(): {
  $or: Array<{
    orderStatus: "paid" | "partially_refunded";
    paymentStatus: "paid" | "partially_refunded";
  }>;
} {
  return {
    $or: [
      { orderStatus: "paid", paymentStatus: "paid" },
      { orderStatus: "partially_refunded", paymentStatus: "partially_refunded" },
    ],
  };
}

export function ownedActiveDownloadPurchaseFilter(purchaseId: Types.ObjectId, userId: Types.ObjectId) {
  return { _id: purchaseId, userId, accessStatus: "active", entitlementType: "download" } as const;
}

export function ownedPersonalizedPdfFilter(pdfId: Types.ObjectId, purchaseId: Types.ObjectId, userId: Types.ObjectId) {
  return { _id: pdfId, purchaseId, userId } as const;
}

export function isDownloadRequestAllowed(minuteLimitAvailable: boolean, issuedDownloadsInHour: number, perHourLimit = 30): boolean {
  return minuteLimitAvailable && Number.isSafeInteger(issuedDownloadsInHour) && issuedDownloadsInHour < perHourLimit;
}
export function pdfSourcesForOrderLine(line: OrderLine): Array<{
  productId: OrderLine["productId"];
  assetId: NonNullable<OrderLine["asset"]>["assetId"];
  version: string;
}> {
  if (line.productType === "pdf" && line.asset) {
    return [{ productId: line.productId, assetId: line.asset.assetId, version: line.asset.version }];
  }
  if (line.productType === "pdf_bundle") {
    return line.includedProducts.map((item) => ({
      productId: item.productId,
      assetId: item.asset.assetId,
      version: item.asset.version,
    }));
  }
  return [];
}
