export type CatalogCategory = 'App' | 'Link' | 'Tool' | 'Game' | 'Resource';
export type CatalogItemType = 'link' | 'encrypted_file';
export type CatalogStatus = 'pending' | 'approved' | 'flagged' | 'archived';
export type ReviewModerationStatus = 'visible' | 'flagged' | 'hidden';
export type ReportTargetType = 'catalog_item' | 'review';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ViewTab = 'directory' | 'vault' | 'submit' | 'admin';

export const CATEGORIES: CatalogCategory[] = ['App', 'Link', 'Tool', 'Game', 'Resource'];

export const CHUNK_SIZE_BYTES = 450000;
export const MAX_UPLOAD_BYTES = 52428800; // 50 MB

export const MAX_LENGTHS = {
  title: 120,
  description: 2000,
  comment: 1000,
  reportReason: 400,
  iconBase64: 120000,
  uploaderName: 120,
  maxFileBytes: MAX_UPLOAD_BYTES,
} as const;

export const ROOT_ADMIN_EMAIL = 'kadir25.bd@gmail.com';
export const CREATOR_HANDLE = '@kadirofficial007';
export const ADMIN_PASSWORD_SHA256 =
  '2572119a627c9e9edbaa54c4199f024a0b9a9ecf6e14cf282b57c5bb3893ded7';

export interface CatalogItem {
  id: string;
  title: string;
  description: string;
  category: CatalogCategory;
  itemType: CatalogItemType;
  version: string;
  fileSizeLabel: string;
  creatorHandle: string;
  encryptedTargetUrl: string;
  urlIv: string;
  encryptedFileId: string;
  sha256Checksum: string;
  encryptionAlgorithm: 'AES-256-GCM';
  status: CatalogStatus;
  downloadCount: number;
  averageRating: number;
  reviewCount: number;
  uploaderUid: string;
  uploaderName: string;
  iconBase64: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface EncryptedFileDoc {
  id: string;
  catalogItemId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  chunkCount: number;
  ciphertextBase64: string;
  ivBase64: string;
  sha256Checksum: string;
  encryptionAlgorithm: 'AES-256-GCM';
  status: CatalogStatus;
  uploaderUid: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface EncryptedFileChunkDoc {
  fileId: string;
  catalogItemId: string;
  chunkIndex: number;
  byteSize: number;
  ciphertextBase64: string;
  ivBase64: string;
  status: CatalogStatus;
  uploaderUid: string;
}

export interface ItemReview {
  id: string;
  itemId: string;
  itemTitle: string;
  userId: string;
  authorName: string;
  rating: number;
  comment: string;
  moderationStatus: ReviewModerationStatus;
  flagReason: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ModerationReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetTitle: string;
  reporterUid: string;
  reporterName: string;
  reason: string;
  status: ReportStatus;
  adminNotes: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface AdminRecord {
  uid: string;
  email?: string;
  grantedBy?: string;
  createdAt: Date | null;
}
