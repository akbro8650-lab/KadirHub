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
  triggerBrowserFileDownload,
} from '@/src/lib/crypto';
import { auth, db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  AdminRecord,
  CatalogCategory,
  CatalogItem,
  CatalogItemType,
  CatalogStatus,
  CREATOR_HANDLE,
  EncryptedFileDoc,
  ItemReview,
  MAX_LENGTHS,
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

export function subscribeApprovedEncryptedFiles(
  onData: (files: EncryptedFileDoc[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'encrypted_files';
  const q = query(collection(db, path), where('status', '==', 'approved'));
  return onSnapshot(
    q,
    (snapshot) => {
      const files = snapshot.docs
        .map((d) => mapEncryptedFile(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      onData(files);
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

// --- Create Catalog Item (+ Encrypted File if applicable) ---

export interface CreateCatalogInput {
  title: string;
  description: string;
  category: CatalogCategory;
  itemType: CatalogItemType;
  version: string;
  targetUrl?: string;
  file?: File | null;
}

export async function createCatalogItem(
  user: User,
  input: CreateCatalogInput
): Promise<string> {
  const title = input.title.trim().slice(0, MAX_LENGTHS.title);
  const description = input.description.trim().slice(0, MAX_LENGTHS.description);
  const version = (input.version || '1.0').trim().slice(0, 64);

  if (title.length < 1 || description.length < 1) {
    throw new Error('Title and description are required.');
  }

  const catalogItemId = generateId('item');

  if (input.itemType === 'encrypted_file') {
    if (!input.file) {
      throw new Error('Please select a file to encrypt with AES-256-GCM.');
    }
    if (input.file.size < 1 || input.file.size > MAX_LENGTHS.maxFileBytes) {
      throw new Error(
        `File size must be between 1 byte and ${formatBytes(MAX_LENGTHS.maxFileBytes)}.`
      );
    }

    const fileId = generateId('file');
    const rawBytes = new Uint8Array(await input.file.arrayBuffer());
    const fileCipher = await encryptBytesWithVaultKey(rawBytes);
    const labelCipher = await encryptTextWithVaultKey(input.file.name);

    const batch = writeBatch(db);
    batch.set(doc(db, 'encrypted_files', fileId), {
      catalogItemId,
      fileName: input.file.name || 'file.bin',
      mimeType: input.file.type || 'application/octet-stream',
      byteSize: rawBytes.byteLength,
      ciphertextBase64: fileCipher.ciphertextBase64,
      ivBase64: fileCipher.ivBase64,
      sha256Checksum: fileCipher.sha256Checksum,
      encryptionAlgorithm: 'AES-256-GCM',
      status: 'approved',
      uploaderUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'catalog_items', catalogItemId), {
      title,
      description,
      category: input.category,
      itemType: 'encrypted_file',
      version,
      fileSizeLabel: formatBytes(rawBytes.byteLength),
      creatorHandle: CREATOR_HANDLE,
      encryptedTargetUrl: labelCipher.ciphertextBase64,
      urlIv: labelCipher.ivBase64,
      encryptedFileId: fileId,
      sha256Checksum: fileCipher.sha256Checksum,
      encryptionAlgorithm: 'AES-256-GCM',
      status: 'approved',
      downloadCount: 0,
      averageRating: 0,
      reviewCount: 0,
      uploaderUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      return catalogItemId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `catalog_items/${catalogItemId}`);
    }
  } else {
    const cleanUrl = (input.targetUrl || '').trim();
    if (!/^https?:\/\/.+/i.test(cleanUrl)) {
      throw new Error('Please enter a valid http:// or https:// URL.');
    }

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
        status: 'approved',
        downloadCount: 0,
        averageRating: 0,
        reviewCount: 0,
        uploaderUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return catalogItemId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

// --- Direct Download & AES-256-GCM Decryption ---

export async function decryptAndDownloadCatalogItem(item: CatalogItem): Promise<{
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
    const decrypted = await decryptBytesWithVaultKey(
      fileDoc.ciphertextBase64,
      fileDoc.ivBase64,
      fileDoc.sha256Checksum || item.sha256Checksum
    );

    triggerBrowserFileDownload(decrypted.bytes, fileDoc.fileName, fileDoc.mimeType);

    if (auth.currentUser) {
      updateDoc(doc(db, 'catalog_items', item.id), {
        downloadCount: item.downloadCount + 1,
        updatedAt: serverTimestamp(),
      }).catch((err) => console.warn('Download counter update skipped:', err));
    }

    return {
      type: 'encrypted_file',
      fileName: fileDoc.fileName,
      checksumVerified: decrypted.checksumVerified,
      actualSha256: decrypted.actualSha256,
    };
  }

  const decrypted = await decryptTextWithVaultKey(
    item.encryptedTargetUrl,
    item.urlIv,
    item.sha256Checksum
  );

  if (auth.currentUser) {
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

export async function decryptAndDownloadStandaloneFile(fileDoc: EncryptedFileDoc): Promise<{
  fileName: string;
  checksumVerified: boolean;
  actualSha256: string;
}> {
  const decrypted = await decryptBytesWithVaultKey(
    fileDoc.ciphertextBase64,
    fileDoc.ivBase64,
    fileDoc.sha256Checksum
  );
  triggerBrowserFileDownload(decrypted.bytes, fileDoc.fileName, fileDoc.mimeType);
  return {
    fileName: fileDoc.fileName,
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
    if (item.encryptedFileId) {
      await updateDoc(doc(db, 'encrypted_files', item.encryptedFileId), {
        status,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminDeleteCatalogItem(item: CatalogItem): Promise<void> {
  const path = `catalog_items/${item.id}`;
  try {
    await deleteDoc(doc(db, 'catalog_items', item.id));
    if (item.encryptedFileId) {
      await deleteDoc(doc(db, 'encrypted_files', item.encryptedFileId)).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
