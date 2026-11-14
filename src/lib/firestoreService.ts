import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  decryptBytesWithVaultKey,
  decryptTextWithVaultKey,
  encryptBytesWithVaultKey,
  encryptTextWithVaultKey,
  formatBytes,
  sha256Hex,
  triggerBrowserFileDownload,
} from '@/src/lib/crypto';
import { auth, db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  AdminRecord,
  CatalogCategory,
  CatalogItem,
  CatalogItemType,
  CatalogStatus,
  CHUNK_SIZE_BYTES,
  CREATOR_HANDLE,
  EncryptedFileDoc,
  ItemReview,
  MAX_LENGTHS,
  MAX_UPLOAD_BYTES,
  ModerationReport,
  ReportStatus,
  ReportTargetType,
  ReviewModerationStatus,
  ROOT_ADMIN_EMAIL,
} from '@/src/types/kadirhub';

function toDateOrNull(val: unknown): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  return null;
}

function generateId(prefix: string): string {
  const rand = window.crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${Date.now()}_${hex}`;
}

function mapCatalogItem(id: string, data: Record<string, unknown>): CatalogItem {
  const rawCategory = String(data.category ?? 'App');
  const validCategories: CatalogCategory[] = ['App', 'Link', 'Tool', 'Game', 'Resource'];
  const category = validCategories.includes(rawCategory as CatalogCategory)
    ? (rawCategory as CatalogCategory)
    : 'App';

  return {
    id,
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    category,
    itemType: data.itemType === 'encrypted_file' ? 'encrypted_file' : 'link',
    version: String(data.version ?? '1.0'),
    fileSizeLabel: String(data.fileSizeLabel ?? 'Direct Link'),
    creatorHandle: String(data.creatorHandle ?? CREATOR_HANDLE),
    encryptedTargetUrl: String(data.encryptedTargetUrl ?? ''),
    urlIv: String(data.urlIv ?? ''),
    encryptedFileId: String(data.encryptedFileId ?? ''),
    sha256Checksum: String(data.sha256Checksum ?? ''),
    encryptionAlgorithm: 'AES-256-GCM',
    status: (data.status as CatalogStatus) ?? 'approved',
    downloadCount: Number(data.downloadCount ?? 0),
    averageRating: Number(data.averageRating ?? 0),
    reviewCount: Number(data.reviewCount ?? 0),
    uploaderUid: String(data.uploaderUid ?? ''),
    uploaderName: String(data.uploaderName ?? data.creatorHandle ?? 'Creator'),
    iconBase64: String(data.iconBase64 ?? ''),
    createdAt: toDateOrNull(data.createdAt),
    updatedAt: toDateOrNull(data.updatedAt),
  };
}

function mapEncryptedFile(id: string, data: Record<string, unknown>): EncryptedFileDoc {
  return {
    id,
    catalogItemId: String(data.catalogItemId ?? ''),
    fileName: String(data.fileName ?? 'download.bin'),
    mimeType: String(data.mimeType ?? 'application/octet-stream'),
    byteSize: Number(data.byteSize ?? 0),
    chunkCount: Number(data.chunkCount ?? 0),
    ciphertextBase64: String(data.ciphertextBase64 ?? ''),
    ivBase64: String(data.ivBase64 ?? ''),
    sha256Checksum: String(data.sha256Checksum ?? ''),
    encryptionAlgorithm: 'AES-256-GCM',
    status: (data.status as CatalogStatus) ?? 'approved',
    uploaderUid: String(data.uploaderUid ?? ''),
    createdAt: toDateOrNull(data.createdAt),
    updatedAt: toDateOrNull(data.updatedAt),
  };
}

function mapReview(id: string, data: Record<string, unknown>): ItemReview {
  return {
    id,
    itemId: String(data.itemId ?? ''),
    itemTitle: String(data.itemTitle ?? ''),
    userId: String(data.userId ?? ''),
    authorName: String(data.authorName ?? 'Community Member'),
    rating: Number(data.rating ?? 5),
    comment: String(data.comment ?? ''),
    moderationStatus: (data.moderationStatus as ReviewModerationStatus) ?? 'visible',
    flagReason: String(data.flagReason ?? ''),
    createdAt: toDateOrNull(data.createdAt),
    updatedAt: toDateOrNull(data.updatedAt),
  };
}

function mapReport(id: string, data: Record<string, unknown>): ModerationReport {
  return {
    id,
    targetType: (data.targetType as ReportTargetType) ?? 'catalog_item',
    targetId: String(data.targetId ?? ''),
    targetTitle: String(data.targetTitle ?? ''),
    reporterUid: String(data.reporterUid ?? ''),
    reporterName: String(data.reporterName ?? 'User'),
    reason: String(data.reason ?? ''),
    status: (data.status as ReportStatus) ?? 'open',
    adminNotes: String(data.adminNotes ?? ''),
    createdAt: toDateOrNull(data.createdAt),
    updatedAt: toDateOrNull(data.updatedAt),
  };
}

export function isUserRootAdmin(user: User | null): boolean {
  return Boolean(user && user.emailVerified && user.email === ROOT_ADMIN_EMAIL);
}

export async function checkIsFirestoreAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email === ROOT_ADMIN_EMAIL) return true;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

// --- Catalog Items Subscriptions ---

export function subscribeApprovedCatalogItems(
  onData: (items: CatalogItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'catalog_items';
  const q = query(collection(db, path), where('status', '==', 'approved'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => mapCatalogItem(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      onData(items);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeMyUploads(
  uid: string,
  onData: (items: CatalogItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'catalog_items';
  const q = query(collection(db, path), where('uploaderUid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => mapCatalogItem(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
      onData(items);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllCatalogItemsAdmin(
  onData: (items: CatalogItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'catalog_items';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => mapCatalogItem(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
      onData(items);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Reviews Subscriptions ---

export function subscribeVisibleReviews(
  itemId: string,
  onData: (reviews: ItemReview[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'reviews';
  const q = query(
    collection(db, path),
    where('itemId', '==', itemId),
    where('moderationStatus', '==', 'visible')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const reviews = snapshot.docs
        .map((d) => mapReview(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
      onData(reviews);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllReviewsAdmin(
  onData: (reviews: ItemReview[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'reviews';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const reviews = snapshot.docs
        .map((d) => mapReview(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
      onData(reviews);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Moderation Reports Subscription (Admin) ---

export function subscribeModerationReportsAdmin(
  onData: (reports: ModerationReport[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'moderation_reports';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const reports = snapshot.docs
        .map((d) => mapReport(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      onData(reports);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Admins Subscription ---

export function subscribeAdmins(
  onData: (admins: AdminRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'admins';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items: AdminRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email ? String(data.email) : undefined,
          grantedBy: data.grantedBy ? String(data.grantedBy) : undefined,
          createdAt: toDateOrNull(data.createdAt),
        };
      });
      onData(items);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Internal File Upload & Chunking Helpers ---

export type ProgressCallback = (label: string, percent: number) => void;

async function uploadEncryptedFileWithChunks(params: {
  fileId: string;
  catalogItemId: string;
  file: File;
  status: CatalogStatus;
  uploaderUid: string;
  onProgress?: ProgressCallback;
}): Promise<{ sha256Checksum: string; byteSize: number; chunkCount: number }> {
  const { fileId, catalogItemId, file, status, uploaderUid, onProgress } = params;
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File size must be between 1 byte and ${formatBytes(MAX_UPLOAD_BYTES)} (50 MB).`
    );
  }

  onProgress?.('Reading & hashing binary file...', 5);
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const fullSha256 = await sha256Hex(rawBytes);

  if (rawBytes.byteLength <= CHUNK_SIZE_BYTES) {
    onProgress?.('Encrypting file with AES-256-GCM...', 40);
    const cipher = await encryptBytesWithVaultKey(rawBytes);
    try {
      await setDoc(doc(db, 'encrypted_files', fileId), {
        catalogItemId,
        fileName: file.name || 'file.bin',
        mimeType: file.type || 'application/octet-stream',
        byteSize: rawBytes.byteLength,
        chunkCount: 0,
        ciphertextBase64: cipher.ciphertextBase64,
        ivBase64: cipher.ivBase64,
        sha256Checksum: fullSha256,
        encryptionAlgorithm: 'AES-256-GCM',
        status,
        uploaderUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `encrypted_files/${fileId}`);
    }
    onProgress?.('File encrypted and stored.', 100);
    return { sha256Checksum: fullSha256, byteSize: rawBytes.byteLength, chunkCount: 0 };
  }

  // Chunked upload (> 450,000 bytes, up to 50 MB)
  const chunkCount = Math.ceil(rawBytes.byteLength / CHUNK_SIZE_BYTES);
  onProgress?.(`Preparing ${chunkCount} encrypted chunks...`, 10);

  try {
    await setDoc(doc(db, 'encrypted_files', fileId), {
      catalogItemId,
      fileName: file.name || 'file.bin',
      mimeType: file.type || 'application/octet-stream',
      byteSize: rawBytes.byteLength,
      chunkCount,
      ciphertextBase64: '',
      ivBase64: '',
      sha256Checksum: fullSha256,
      encryptionAlgorithm: 'AES-256-GCM',
      status,
      uploaderUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `encrypted_files/${fileId}`);
  }

  const CHUNKS_PER_BATCH = 8;
  for (let start = 0; start < chunkCount; start += CHUNKS_PER_BATCH) {
    const end = Math.min(chunkCount, start + CHUNKS_PER_BATCH);
    const batch = writeBatch(db);

    for (let i = start; i < end; i++) {
      const offset = i * CHUNK_SIZE_BYTES;
      const slice = rawBytes.subarray(offset, Math.min(rawBytes.byteLength, offset + CHUNK_SIZE_BYTES));
      const chunkCipher = await encryptBytesWithVaultKey(slice);
      const chunkRef = doc(db, 'encrypted_files', fileId, 'chunks', `chunk_${i}`);
      batch.set(chunkRef, {
        fileId,
        catalogItemId,
        chunkIndex: i,
        byteSize: slice.byteLength,
        ciphertextBase64: chunkCipher.ciphertextBase64,
        ivBase64: chunkCipher.ivBase64,
        status,
        uploaderUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `encrypted_files/${fileId}/chunks/chunk_${start}`
      );
    }

    const pct = Math.min(98, Math.round(10 + (end / chunkCount) * 88));
    onProgress?.(`Uploading encrypted chunks (${end}/${chunkCount})...`, pct);
  }

  return { sha256Checksum: fullSha256, byteSize: rawBytes.byteLength, chunkCount };
}

async function updateEncryptedFileAndChunksStatus(
  fileId: string,
  status: CatalogStatus
): Promise<void> {
  if (!fileId) return;
  const filePath = `encrypted_files/${fileId}`;
  let fileSnap;
  try {
    fileSnap = await getDoc(doc(db, 'encrypted_files', fileId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, filePath);
  }

  if (!fileSnap.exists()) return;
  const chunkCount = Number(fileSnap.data().chunkCount ?? 0);

  try {
    await updateDoc(doc(db, 'encrypted_files', fileId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, filePath);
  }

  if (chunkCount > 0) {
    const BATCH_LIMIT = 200;
    for (let start = 0; start < chunkCount; start += BATCH_LIMIT) {
      const end = Math.min(chunkCount, start + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (let i = start; i < end; i++) {
        batch.update(doc(db, 'encrypted_files', fileId, 'chunks', `chunk_${i}`), {
          status,
          updatedAt: serverTimestamp(),
        });
      }
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `encrypted_files/${fileId}/chunks`
        );
      }
    }
  }
}

async function deleteEncryptedFileAndChunks(fileId: string): Promise<void> {
  if (!fileId) return;
  const filePath = `encrypted_files/${fileId}`;
  try {
    const fileSnap = await getDoc(doc(db, 'encrypted_files', fileId));
    if (fileSnap.exists()) {
      const chunkCount = Number(fileSnap.data().chunkCount ?? 0);
      if (chunkCount > 0) {
        const BATCH_LIMIT = 200;
        for (let start = 0; start < chunkCount; start += BATCH_LIMIT) {
          const end = Math.min(chunkCount, start + BATCH_LIMIT);
          const batch = writeBatch(db);
          for (let i = start; i < end; i++) {
            batch.delete(doc(db, 'encrypted_files', fileId, 'chunks', `chunk_${i}`));
          }
          await batch.commit();
        }
      }
      await deleteDoc(doc(db, 'encrypted_files', fileId));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, filePath);
  }
}

// --- Create Catalog Item (v1.1.0 Open Community Upload + 50 MB Chunked) ---

export interface CreateCatalogInput {
  title: string;
  description: string;
  category: CatalogCategory;
  itemType: CatalogItemType;
  version: string;
  targetUrl?: string;
  file?: File | null;
  iconBase64?: string;
}

export async function createCatalogItem(
  user: User,
  input: CreateCatalogInput,
  isAdmin: boolean,
  onProgress?: ProgressCallback
): Promise<string> {
  const title = input.title.trim().slice(0, MAX_LENGTHS.title);
  const description = input.description.trim().slice(0, MAX_LENGTHS.description);
  const version = (input.version || '1.0').trim().slice(0, 64);
  const iconBase64 = (input.iconBase64 || '').trim().slice(0, MAX_LENGTHS.iconBase64);
  const uploaderName = (user.displayName || user.email?.split('@')[0] || 'Creator')
    .trim()
    .slice(0, MAX_LENGTHS.uploaderName);

  if (title.length < 1 || description.length < 1) {
    throw new Error('Title and description are required.');
  }

  // Non-admin uploads MUST create catalog_items, encrypted_files, and chunks with status = "pending"
  const initialStatus: CatalogStatus = isAdmin ? 'approved' : 'pending';
  const catalogItemId = generateId('item');

  if (input.itemType === 'encrypted_file') {
    if (!input.file) {
      throw new Error('Please select a file (up to 50 MB) to encrypt.');
    }

    const fileId = generateId('file');
    const uploaded = await uploadEncryptedFileWithChunks({
      fileId,
      catalogItemId,
      file: input.file,
      status: initialStatus,
      uploaderUid: user.uid,
      onProgress,
    });

    const labelCipher = await encryptTextWithVaultKey(input.file.name || 'file.bin');
    const path = `catalog_items/${catalogItemId}`;

    try {
      await setDoc(doc(db, 'catalog_items', catalogItemId), {
        title,
        description,
        category: input.category,
        itemType: 'encrypted_file',
        version,
        fileSizeLabel: formatBytes(uploaded.byteSize),
        creatorHandle: CREATOR_HANDLE,
        encryptedTargetUrl: labelCipher.ciphertextBase64,
        urlIv: labelCipher.ivBase64,
        encryptedFileId: fileId,
        sha256Checksum: uploaded.sha256Checksum,
        encryptionAlgorithm: 'AES-256-GCM',
        status: initialStatus,
        downloadCount: 0,
        averageRating: 0,
        reviewCount: 0,
        uploaderUid: user.uid,
        uploaderName,
        iconBase64,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onProgress?.('Published to KadirHub.', 100);
      return catalogItemId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    const cleanUrl = (input.targetUrl || '').trim();
    if (!/^https?:\/\/.+/i.test(cleanUrl)) {
      throw new Error('Please enter a valid http:// or https:// URL.');
    }

    onProgress?.('Encrypting URL with AES-256-GCM...', 50);
    const urlCipher = await encryptTextWithVaultKey(cleanUrl);
    const path = `catalog_items/${catalogItemId}`;

    try {
      await setDoc(doc(db, 'catalog_items', catalogItemId), {
        title,
        description,
        category: input.category,
        itemType: 'link',
        version,
        fileSizeLabel: 'Direct Link',
        creatorHandle: CREATOR_HANDLE,
        encryptedTargetUrl: urlCipher.ciphertextBase64,
        urlIv: urlCipher.ivBase64,
        encryptedFileId: '',
        sha256Checksum: urlCipher.sha256Checksum,
        encryptionAlgorithm: 'AES-256-GCM',
        status: initialStatus,
        downloadCount: 0,
        averageRating: 0,
        reviewCount: 0,
        uploaderUid: user.uid,
        uploaderName,
        iconBase64,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onProgress?.('Submitted!', 100);
      return catalogItemId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

// --- Uploader Edit & Delete ---

export interface UpdateCatalogInput {
  title: string;
  description: string;
  category: CatalogCategory;
  itemType: CatalogItemType;
  version: string;
  targetUrl?: string;
  newFile?: File | null;
  iconBase64: string;
}

export async function updateCatalogItemByUploader(
  user: User,
  existing: CatalogItem,
  input: UpdateCatalogInput,
  isAdmin: boolean,
  onProgress?: ProgressCallback
): Promise<void> {
  const title = input.title.trim().slice(0, MAX_LENGTHS.title);
  const description = input.description.trim().slice(0, MAX_LENGTHS.description);
  const version = (input.version || '1.0').trim().slice(0, 64);
  const iconBase64 = input.iconBase64.trim().slice(0, MAX_LENGTHS.iconBase64);

  if (title.length < 1 || description.length < 1) {
    throw new Error('Title and description are required.');
  }

  // Critical v1.1.0 requirement: non-admin edits MUST reset status to "pending"
  const nextStatus: CatalogStatus = isAdmin ? existing.status : 'pending';

  const updateFields: Record<string, unknown> = {
    title,
    description,
    category: input.category,
    version,
    iconBase64,
    status: nextStatus,
    updatedAt: serverTimestamp(),
  };

  if (input.itemType === 'link') {
    const cleanUrl = (input.targetUrl || '').trim();
    if (cleanUrl) {
      if (!/^https?:\/\/.+/i.test(cleanUrl)) {
        throw new Error('Please enter a valid http:// or https:// URL.');
      }
      const urlCipher = await encryptTextWithVaultKey(cleanUrl);
      updateFields.itemType = 'link';
      updateFields.fileSizeLabel = 'Direct Link';
      updateFields.encryptedTargetUrl = urlCipher.ciphertextBase64;
      updateFields.urlIv = urlCipher.ivBase64;
      updateFields.encryptedFileId = '';
      updateFields.sha256Checksum = urlCipher.sha256Checksum;

      if (existing.encryptedFileId) {
        await deleteEncryptedFileAndChunks(existing.encryptedFileId);
      }
    } else if (existing.itemType === 'encrypted_file') {
      throw new Error('Enter a target URL when switching from file to link.');
    }
  } else {
    // itemType === 'encrypted_file'
    if (input.newFile) {
      const newFileId = generateId('file');
      const uploaded = await uploadEncryptedFileWithChunks({
        fileId: newFileId,
        catalogItemId: existing.id,
        file: input.newFile,
        status: nextStatus,
        uploaderUid: user.uid,
        onProgress,
      });
      const labelCipher = await encryptTextWithVaultKey(input.newFile.name || 'file.bin');

      updateFields.itemType = 'encrypted_file';
      updateFields.fileSizeLabel = formatBytes(uploaded.byteSize);
      updateFields.encryptedTargetUrl = labelCipher.ciphertextBase64;
      updateFields.urlIv = labelCipher.ivBase64;
      updateFields.encryptedFileId = newFileId;
      updateFields.sha256Checksum = uploaded.sha256Checksum;

      if (existing.encryptedFileId) {
        await deleteEncryptedFileAndChunks(existing.encryptedFileId);
      }
    } else {
      if (!existing.encryptedFileId) {
        throw new Error('Select a file to attach.');
      }
      await updateEncryptedFileAndChunksStatus(existing.encryptedFileId, nextStatus);
    }
  }

  const path = `catalog_items/${existing.id}`;
  try {
    await updateDoc(doc(db, 'catalog_items', existing.id), updateFields);
    onProgress?.('Changes saved.', 100);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCatalogItemAndFiles(item: CatalogItem): Promise<void> {
  if (item.encryptedFileId) {
    await deleteEncryptedFileAndChunks(item.encryptedFileId);
  }
  const path = `catalog_items/${item.id}`;
  try {
    await deleteDoc(doc(db, 'catalog_items', item.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Direct Download & Chunked AES-256-GCM Decryption ---

export async function decryptAndDownloadCatalogItem(
  item: CatalogItem,
  onProgress?: ProgressCallback
): Promise<{
  type: CatalogItemType;
  url?: string;
  fileName?: string;
  checksumVerified: boolean;
  actualSha256: string;
}> {
  if (item.itemType === 'encrypted_file' && item.encryptedFileId) {
    const filePath = `encrypted_files/${item.encryptedFileId}`;
    let fileSnap;
    try {
      fileSnap = await getDoc(doc(db, 'encrypted_files', item.encryptedFileId));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, filePath);
    }

    if (!fileSnap.exists()) {
      throw new Error('Encrypted file payload not found in Firestore.');
    }

    const fileDoc = mapEncryptedFile(fileSnap.id, fileSnap.data() as Record<string, unknown>);
    const expectedSha = fileDoc.sha256Checksum || item.sha256Checksum;

    let finalBytes: Uint8Array;
    let checksumVerified = false;
    let actualSha256 = '';

    if (fileDoc.chunkCount > 0) {
      onProgress?.(`Fetching ${fileDoc.chunkCount} encrypted chunks...`, 5);
      const chunkBuffers: Uint8Array[] = new Array(fileDoc.chunkCount);
      let completed = 0;
      const CONCURRENCY = 4;

      for (let start = 0; start < fileDoc.chunkCount; start += CONCURRENCY) {
        const indices: number[] = [];
        for (let i = start; i < Math.min(fileDoc.chunkCount, start + CONCURRENCY); i++) {
          indices.push(i);
        }

        await Promise.all(
          indices.map(async (chunkIndex) => {
            const chunkPath = `encrypted_files/${fileDoc.id}/chunks/chunk_${chunkIndex}`;
            let chunkSnap;
            try {
              chunkSnap = await getDoc(
                doc(db, 'encrypted_files', fileDoc.id, 'chunks', `chunk_${chunkIndex}`)
              );
            } catch (error) {
              handleFirestoreError(error, OperationType.GET, chunkPath);
            }
            if (!chunkSnap.exists()) {
              throw new Error(`Missing encrypted chunk_${chunkIndex}.`);
            }
            const chunkData = chunkSnap.data();
            const decryptedChunk = await decryptBytesWithVaultKey(
              String(chunkData.ciphertextBase64 ?? ''),
              String(chunkData.ivBase64 ?? '')
            );
            chunkBuffers[chunkIndex] = decryptedChunk.bytes;
            completed += 1;
            const pct = Math.min(92, Math.round(5 + (completed / fileDoc.chunkCount) * 87));
            onProgress?.(`Decrypting chunk ${completed}/${fileDoc.chunkCount}...`, pct);
          })
        );
      }

      const totalLength = chunkBuffers.reduce((acc, buf) => acc + buf.byteLength, 0);
      finalBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of chunkBuffers) {
        finalBytes.set(buf, offset);
        offset += buf.byteLength;
      }

      onProgress?.('Verifying full-file SHA-256 checksum...', 96);
      actualSha256 = await sha256Hex(finalBytes);
      checksumVerified = expectedSha
        ? actualSha256.toLowerCase() === expectedSha.toLowerCase()
        : true;
    } else {
      onProgress?.('Decrypting file payload...', 50);
      const decrypted = await decryptBytesWithVaultKey(
        fileDoc.ciphertextBase64,
        fileDoc.ivBase64,
        expectedSha
      );
      finalBytes = decrypted.bytes;
      checksumVerified = decrypted.checksumVerified;
      actualSha256 = decrypted.actualSha256;
    }

    if (!checksumVerified) {
      throw new Error(
        `SHA-256 integrity verification failed! Expected ${expectedSha}, got ${actualSha256}. Download aborted.`
      );
    }

    onProgress?.('Starting browser download...', 100);
    triggerBrowserFileDownload(finalBytes, fileDoc.fileName, fileDoc.mimeType);

    if (auth.currentUser && item.status === 'approved') {
      updateDoc(doc(db, 'catalog_items', item.id), {
        downloadCount: item.downloadCount + 1,
        updatedAt: serverTimestamp(),
      }).catch((err) => console.warn('Download counter update skipped:', err));
    }

    return {
      type: 'encrypted_file',
      fileName: fileDoc.fileName,
      checksumVerified,
      actualSha256,
    };
  }

  const decrypted = await decryptTextWithVaultKey(
    item.encryptedTargetUrl,
    item.urlIv,
    item.sha256Checksum
  );

  if (auth.currentUser && item.status === 'approved') {
    updateDoc(doc(db, 'catalog_items', item.id), {
      downloadCount: item.downloadCount + 1,
      updatedAt: serverTimestamp(),
    }).catch((err) => console.warn('Download counter update skipped:', err));
  }

  return {
    type: 'link',
    url: decrypted.text,
    checksumVerified: decrypted.checksumVerified,
    actualSha256: decrypted.actualSha256,
  };
}

// --- Reviews (/reviews/${itemId}_${uid}) ---

async function syncItemRatingStats(itemId: string): Promise<void> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'reviews'),
        where('itemId', '==', itemId),
        where('moderationStatus', '==', 'visible')
      )
    );
    const ratings = snap.docs.map((d) => Number(d.data().rating ?? 5));
    const reviewCount = ratings.length;
    const averageRating =
      reviewCount > 0
        ? Number((ratings.reduce((sum, r) => sum + r, 0) / reviewCount).toFixed(2))
        : 0;
    await updateDoc(doc(db, 'catalog_items', itemId), {
      averageRating,
      reviewCount,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Aggregate rating sync skipped:', err);
  }
}

export async function submitOrUpdateReview(
  item: CatalogItem,
  user: User,
  rating: number,
  comment: string
): Promise<void> {
  const cleanRating = Math.min(5, Math.max(1, Math.round(rating)));
  const cleanComment = comment.trim().slice(0, MAX_LENGTHS.comment);
  if (cleanComment.length < 1) {
    throw new Error('Please enter a review comment.');
  }

  const reviewId = `${item.id}_${user.uid}`;
  const reviewRef = doc(db, 'reviews', reviewId);
  const path = `reviews/${reviewId}`;

  try {
    const existing = await getDoc(reviewRef);
    if (existing.exists()) {
      await updateDoc(reviewRef, {
        rating: cleanRating,
        comment: cleanComment,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(reviewRef, {
        itemId: item.id,
        itemTitle: item.title,
        userId: user.uid,
        authorName: (user.displayName || 'Community Member').trim().slice(0, 80),
        rating: cleanRating,
        comment: cleanComment,
        moderationStatus: 'visible',
        flagReason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  await syncItemRatingStats(item.id);
}

export async function deleteReview(reviewId: string, itemId: string): Promise<void> {
  const path = `reviews/${reviewId}`;
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
  await syncItemRatingStats(itemId);
}

// --- Content Moderation Reports (/moderation_reports/{reportId}) ---

export async function submitModerationReport(
  user: User,
  params: {
    targetType: ReportTargetType;
    targetId: string;
    targetTitle: string;
    reason: string;
  }
): Promise<string> {
  const reason = params.reason.trim().slice(0, MAX_LENGTHS.reportReason);
  if (reason.length < 3) {
    throw new Error('Report reason must be at least 3 characters.');
  }
  const reportId = generateId('report');
  const path = `moderation_reports/${reportId}`;
  try {
    await setDoc(doc(db, 'moderation_reports', reportId), {
      targetType: params.targetType,
      targetId: params.targetId,
      targetTitle: params.targetTitle.slice(0, 120),
      reporterUid: user.uid,
      reporterName: (user.displayName || 'Member').trim().slice(0, 80),
      reason,
      status: 'open',
      adminNotes: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return reportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// --- Admin Moderation Actions ---

export async function adminUpdateCatalogStatus(
  item: CatalogItem,
  status: CatalogStatus
): Promise<void> {
  const path = `catalog_items/${item.id}`;
  try {
    await updateDoc(doc(db, 'catalog_items', item.id), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  if (item.encryptedFileId) {
    await updateEncryptedFileAndChunksStatus(item.encryptedFileId, status);
  }
}

export async function adminDeleteCatalogItem(item: CatalogItem): Promise<void> {
  await deleteCatalogItemAndFiles(item);
}

export async function adminModerateReview(
  review: ItemReview,
  moderationStatus: ReviewModerationStatus,
  flagReason: string
): Promise<void> {
  const path = `reviews/${review.id}`;
  try {
    await updateDoc(doc(db, 'reviews', review.id), {
      moderationStatus,
      flagReason: flagReason.trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  await syncItemRatingStats(review.itemId);
}

export async function adminUpdateReportStatus(
  reportId: string,
  status: ReportStatus,
  adminNotes: string
): Promise<void> {
  const path = `moderation_reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'moderation_reports', reportId), {
      status,
      adminNotes: adminNotes.trim().slice(0, 400),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function grantAdminAccess(
  targetUid: string,
  targetEmail: string,
  grantedByUid: string
): Promise<void> {
  const cleanUid = targetUid.trim();
  const path = `admins/${cleanUid}`;
  try {
    await setDoc(doc(db, 'admins', cleanUid), {
      uid: cleanUid,
      email: targetEmail.trim(),
      grantedBy: grantedByUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function revokeAdminAccess(targetUid: string): Promise<void> {
  const path = `admins/${targetUid}`;
  try {
    await deleteDoc(doc(db, 'admins', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
