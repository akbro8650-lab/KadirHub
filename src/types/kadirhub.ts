export const OWNER_EMAIL = 'kadir25.bd@gmail.com';
export const CREATOR_HANDLE = '@kadirofficial007';

export const CHUNK_SIZE_BYTES = 450000;
export const MAX_APK_UPLOAD_BYTES = 104857600; // 100 MB

export const APK_LIMITS = {
  appName: 120,
  packageName: 160,
  versionName: 64,
  description: 4000,
  fileName: 180,
  iconBase64: 120000,
  maxApkBytes: MAX_APK_UPLOAD_BYTES,
} as const;

export interface ApkRelease {
  id: string;
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  description: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  fileSizeLabel: string;
  chunkCount: number;
  sha256Checksum: string;
  encryptionAlgorithm: 'AES-256-GCM';
  iconBase64: string;
  isMain: boolean;
  isPublished: boolean;
  uploaderUid: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ApkFilePayload {
  id: string;
  releaseId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  chunkCount: number;
  ciphertextBase64: string;
  ivBase64: string;
  sha256Checksum: string;
  isPublished: boolean;
  uploaderUid: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}
