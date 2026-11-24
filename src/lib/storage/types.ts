export interface UploadPdfInput {
  objectKey: string;
  body: Uint8Array;
  originalFileName: string;
  contentType: "application/pdf";
  metadata: {
    assetId: string;
    productId: string;
    version: string;
  };
}

export interface StoredObjectMetadata {
  objectKey: string;
  sizeBytes: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  metadata: Readonly<Record<string, string>>;
}

export interface SignedDownloadInput {
  objectKey: string;
  expiresInSeconds?: number;
  downloadFileName?: string;
}

export interface PrivatePdfStorage {
  upload(input: UploadPdfInput): Promise<void>;
  getPrivatePdf(objectKey: string): Promise<Uint8Array>;
  delete(objectKey: string): Promise<void>;
  exists(objectKey: string): Promise<boolean>;
  getMetadata(objectKey: string): Promise<StoredObjectMetadata | null>;
  createSignedDownloadUrl(input: SignedDownloadInput): Promise<string>;
}
