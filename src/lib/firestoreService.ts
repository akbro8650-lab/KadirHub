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
  encryptBytesWithVaultKey,
  formatBytes,
  sha256Hex,
  triggerBrowserFileDownload,
} from '@/src/lib/crypto';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import {
  APK_LIMITS,
  ApkFilePayload,
  ApkRelease,
  CHUNK_SIZE_BYTES,
  MAX_APK_UPLOAD_BYTES,
  OWNER_EMAIL,
} from '@/src/types/kadirhub';

export type ProgressCallback = (label: string, percent: number) => void;

function toDateOrNull(val: unknown): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  return null;
}

function generateReleaseId(): string {
  const rand = window.crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `apk_${Date.now()}_${hex}`;
}

export function isVerifiedOwner(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );
}

function mapApkRelease(id: string, data: Record<string, unknown>): ApkRelease {
  return {
    id,
    appName: String(data.appName ?? 'KadirHub'),
    packageName: String(data.packageName ?? ''),
    versionName: String(data.versionName ?? '1.0.0'),
    versionCode: Number(data.versionCode ?? 1),
    description: String(data.description ?? ''),
    fileName: String(data.fileName ?? 'KadirHub.apk'),
    mimeType: String(data.mimeType ?? 'application/vnd.android.package-archive'),
    byteSize: Number(data.byteSize ?? 0),
    fileSizeLabel: String(data.fileSizeLabel ?? '0 B'),
    chunkCount: Number(data.chunkCount ?? 0),
    sha256Checksum: String(data.sha256Checksum ?? ''),
    encryptionAlgorithm: 'AES-256-GCM',
    iconBase64: String(data.iconBase64 ?? ''),
    isMain: Boolean(data.isMain),
    isPublished: Boolean(data.isPublished),
    uploaderUid: String(data.uploaderUid ?? ''),
    createdAt: toDateOrNull(data.createdAt),
    updatedAt: toDateOrNull(data.updatedAt),
  };
}

function mapApkFilePayload(id: string, data: Record<string, unknown>): ApkFilePayload {
  return {
    id,
    releaseId: String(data.releaseId ?? id),
    fileName: String(data.fileName ?? 'KadirHub.apk'),
    mimeType: String(data.mimeType ?? 'application/vnd.android.package-archive'),
    byteSize: Number(data.byteSize ?? 0),
    chunkCount: Number(data.chunkCount ?? 0),
    ciphertextBase64: String(data.ciphertextBase64 ?? ''),
    ivBase64: String(data.ivBase64 ?? ''),
    sha256Checksum: String(data.sha256Checksum ?? ''),
    isPublished: Boolean(data.isPublished),
    uploaderUid: String(data.uploaderUid ?? ''),
    createdAt: toDateOrNull(data.createdAt),
    updatedAt: toDateOrNull(data.updatedAt),
  };
}

function sortReleases(list: ApkRelease[]): ApkRelease[] {
  return [...list].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    if (b.versionCode !== a.versionCode) return b.versionCode - a.versionCode;
    return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  });
}

// Public subscription (NO authentication required; queries isPublished == true)
export function subscribePublishedApkReleases(
  onData: (releases: ApkRelease[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'apk_releases';
  const q = query(collection(db, path), where('isPublished', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const releases = sortReleases(
        snapshot.docs.map((d) => mapApkRelease(d.id, d.data() as Record<string, unknown>))
      );
      onData(releases);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// Owner-only subscription (includes unpublished drafts)
export function subscribeAllApkReleasesOwner(
  onData: (releases: ApkRelease[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'apk_releases';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const releases = sortReleases(
        snapshot.docs.map((d) => mapApkRelease(d.id, d.data() as Record<string, unknown>))
      );
      onData(releases);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Internal Chunk Upload / Cleanup Helpers ---

function normalizeApkMimeType(file: File): string {
  const raw = (file.type || '').trim();
  if (raw && raw.length <= 120) return raw;
  return 'application/vnd.android.package-archive';
}

function normalizeApkFileName(file: File, appName: string, versionName: string): string {
  const raw = (file.name || '').trim();
  if (raw) return raw.slice(0, APK_LIMITS.fileName);
  const safeApp = appName.replace(/[^a-zA-Z0-9._\-]+/g, '_') || 'KadirHub';
  const safeVer = versionName.replace(/[^a-zA-Z0-9._\-]+/g, '_') || '1.0.0';
  return `${safeApp}-v${safeVer}.apk`.slice(0, APK_LIMITS.fileName);
}

async function deleteChunksForRelease(releaseId: string, chunkCount: number): Promise<void> {
  if (chunkCount <= 0) return;
  const BATCH_LIMIT = 200;
  for (let start = 0; start < chunkCount; start += BATCH_LIMIT) {
    const end = Math.min(chunkCount, start + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (let i = start; i < end; i++) {
      batch.delete(doc(db, 'apk_files', releaseId, 'chunks', `chunk_${i}`));
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `apk_files/${releaseId}/chunks`);
    }
  }
}

async function uploadApkPayloadWithChunks(params: {
  releaseId: string;
  file: File;
  fileName: string;
  mimeType: string;
  isPublished: boolean;
  uploaderUid: string;
  isUpdateExistingPayload: boolean;
  oldChunkCount: number;
  onProgress?: ProgressCallback;
}): Promise<{ sha256Checksum: string; byteSize: number; chunkCount: number }> {
  const {
    releaseId,
    file,
    fileName,
    mimeType,
    isPublished,
    uploaderUid,
    isUpdateExistingPayload,
    oldChunkCount,
    onProgress,
  } = params;

  if (file.size < 1 || file.size > MAX_APK_UPLOAD_BYTES) {
    throw new Error(
      `APK size must be between 1 byte and ${formatBytes(MAX_APK_UPLOAD_BYTES)} (100 MB).`
    );
  }

  onProgress?.('Reading & computing SHA-256 checksum...', 5);
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const sha256Checksum = await sha256Hex(rawBytes);

  if (isUpdateExistingPayload && oldChunkCount > 0) {
    onProgress?.('Cleaning up previous APK chunks...', 8);
    await deleteChunksForRelease(releaseId, oldChunkCount);
  }

  const fileDocRef = doc(db, 'apk_files', releaseId);
  const filePath = `apk_files/${releaseId}`;

  if (rawBytes.byteLength <= CHUNK_SIZE_BYTES) {
    onProgress?.('Encrypting APK with AES-256-GCM...', 45);
    const cipher = await encryptBytesWithVaultKey(rawBytes);

    try {
      if (isUpdateExistingPayload) {
        await updateDoc(fileDocRef, {
          fileName,
          mimeType,
          byteSize: rawBytes.byteLength,
          chunkCount: 0,
          ciphertextBase64: cipher.ciphertextBase64,
          ivBase64: cipher.ivBase64,
          sha256Checksum,
          isPublished,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(fileDocRef, {
          releaseId,
          fileName,
          mimeType,
          byteSize: rawBytes.byteLength,
          chunkCount: 0,
          ciphertextBase64: cipher.ciphertextBase64,
          ivBase64: cipher.ivBase64,
          sha256Checksum,
          isPublished,
          uploaderUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        isUpdateExistingPayload ? OperationType.UPDATE : OperationType.CREATE,
        filePath
      );
    }

    onProgress?.('APK payload stored.', 95);
    return { sha256Checksum, byteSize: rawBytes.byteLength, chunkCount: 0 };
  }

  // Multi-chunk APK upload (> 450,000 bytes)
  const chunkCount = Math.ceil(rawBytes.byteLength / CHUNK_SIZE_BYTES);
  onProgress?.(`Preparing ${chunkCount} encrypted APK segments...`, 12);

  try {
    if (isUpdateExistingPayload) {
      await updateDoc(fileDocRef, {
        fileName,
        mimeType,
        byteSize: rawBytes.byteLength,
        chunkCount,
        ciphertextBase64: '',
        ivBase64: '',
        sha256Checksum,
        isPublished,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(fileDocRef, {
        releaseId,
        fileName,
        mimeType,
        byteSize: rawBytes.byteLength,
        chunkCount,
        ciphertextBase64: '',
        ivBase64: '',
        sha256Checksum,
        isPublished,
        uploaderUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      isUpdateExistingPayload ? OperationType.UPDATE : OperationType.CREATE,
      filePath
    );
  }

  const CHUNKS_PER_BATCH = 8;
  for (let start = 0; start < chunkCount; start += CHUNKS_PER_BATCH) {
    const end = Math.min(chunkCount, start + CHUNKS_PER_BATCH);
    const batch = writeBatch(db);

    for (let i = start; i < end; i++) {
      const offset = i * CHUNK_SIZE_BYTES;
      const slice = rawBytes.subarray(
        offset,
        Math.min(rawBytes.byteLength, offset + CHUNK_SIZE_BYTES)
      );
      const chunkCipher = await encryptBytesWithVaultKey(slice);
      const chunkRef = doc(db, 'apk_files', releaseId, 'chunks', `chunk_${i}`);
      batch.set(chunkRef, {
        releaseId,
        chunkIndex: i,
        byteSize: slice.byteLength,
        ciphertextBase64: chunkCipher.ciphertextBase64,
        ivBase64: chunkCipher.ivBase64,
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
        `apk_files/${releaseId}/chunks/chunk_${start}`
      );
    }

    const pct = Math.min(96, Math.round(12 + (end / chunkCount) * 84));
    onProgress?.(`Uploading APK segments (${end}/${chunkCount})...`, pct);
  }

  return { sha256Checksum, byteSize: rawBytes.byteLength, chunkCount };
}

async function demoteOtherMainReleases(keepReleaseId: string): Promise<void> {
  try {
    const snap = await getDocs(
      query(collection(db, 'apk_releases'), where('isMain', '==', true))
    );
    const toDemote = snap.docs.filter((d) => d.id !== keepReleaseId);
    if (toDemote.length === 0) return;

    const batch = writeBatch(db);
    for (const d of toDemote) {
      batch.update(d.ref, {
        isMain: false,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    console.warn('Unable to demote previous main release:', error);
  }
}

// --- Owner Mutations (kadir25.bd@gmail.com only) ---

export interface SaveApkReleaseInput {
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  description: string;
  iconBase64: string;
  isMain: boolean;
  isPublished: boolean;
  file?: File | null;
}

export async function createApkRelease(
  user: User,
  input: SaveApkReleaseInput,
  onProgress?: ProgressCallback
): Promise<string> {
  if (!isVerifiedOwner(user)) {
    throw new Error(`Only verified owner (${OWNER_EMAIL}) can publish APK releases.`);
  }
  if (!input.file) {
    throw new Error('Please choose an .apk file to upload.');
  }

  const appName = input.appName.trim().slice(0, APK_LIMITS.appName);
  const packageName = input.packageName.trim().slice(0, APK_LIMITS.packageName);
  const versionName = input.versionName.trim().slice(0, APK_LIMITS.versionName);
  const versionCode = Math.max(1, Math.min(999999999, Math.round(input.versionCode || 1)));
  const description = input.description.trim().slice(0, APK_LIMITS.description);
  const iconBase64 = input.iconBase64.trim().slice(0, APK_LIMITS.iconBase64);

  if (!appName || !versionName || !description) {
    throw new Error('App name, version name, and description are required.');
  }

  const releaseId = generateReleaseId();
  const fileName = normalizeApkFileName(input.file, appName, versionName);
  const mimeType = normalizeApkMimeType(input.file);

  const uploaded = await uploadApkPayloadWithChunks({
    releaseId,
    file: input.file,
    fileName,
    mimeType,
    isPublished: input.isPublished,
    uploaderUid: user.uid,
    isUpdateExistingPayload: false,
    oldChunkCount: 0,
    onProgress,
  });

  if (input.isMain) {
    await demoteOtherMainReleases(releaseId);
  }

  const releasePath = `apk_releases/${releaseId}`;
  try {
    await setDoc(doc(db, 'apk_releases', releaseId), {
      id: releaseId,
      appName,
      packageName,
      versionName,
      versionCode,
      description,
      fileName,
      mimeType,
      byteSize: uploaded.byteSize,
      fileSizeLabel: formatBytes(uploaded.byteSize),
      chunkCount: uploaded.chunkCount,
      sha256Checksum: uploaded.sha256Checksum,
      encryptionAlgorithm: 'AES-256-GCM',
      iconBase64,
      isMain: input.isMain,
      isPublished: input.isPublished,
      uploaderUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    onProgress?.('APK release published.', 100);
    return releaseId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, releasePath);
  }
}

export async function updateApkRelease(
  user: User,
  existing: ApkRelease,
  input: SaveApkReleaseInput,
  onProgress?: ProgressCallback
): Promise<void> {
  if (!isVerifiedOwner(user)) {
    throw new Error(`Only verified owner (${OWNER_EMAIL}) can edit APK releases.`);
  }

  const appName = input.appName.trim().slice(0, APK_LIMITS.appName);
  const packageName = input.packageName.trim().slice(0, APK_LIMITS.packageName);
  const versionName = input.versionName.trim().slice(0, APK_LIMITS.versionName);
  const versionCode = Math.max(1, Math.min(999999999, Math.round(input.versionCode || 1)));
  const description = input.description.trim().slice(0, APK_LIMITS.description);
  const iconBase64 = input.iconBase64.trim().slice(0, APK_LIMITS.iconBase64);

  if (!appName || !versionName || !description) {
    throw new Error('App name, version name, and description are required.');
  }

  let fileName = existing.fileName;
  let mimeType = existing.mimeType;
  let byteSize = existing.byteSize;
  let chunkCount = existing.chunkCount;
  let sha256Checksum = existing.sha256Checksum;

  if (input.file) {
    fileName = normalizeApkFileName(input.file, appName, versionName);
    mimeType = normalizeApkMimeType(input.file);
    const uploaded = await uploadApkPayloadWithChunks({
      releaseId: existing.id,
      file: input.file,
      fileName,
      mimeType,
      isPublished: input.isPublished,
      uploaderUid: user.uid,
      isUpdateExistingPayload: true,
      oldChunkCount: existing.chunkCount,
      onProgress,
    });
    byteSize = uploaded.byteSize;
    chunkCount = uploaded.chunkCount;
    sha256Checksum = uploaded.sha256Checksum;
  } else if (input.isPublished !== existing.isPublished) {
    try {
      await updateDoc(doc(db, 'apk_files', existing.id), {
        isPublished: input.isPublished,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `apk_files/${existing.id}`);
    }
  }

  if (input.isMain && !existing.isMain) {
    await demoteOtherMainReleases(existing.id);
  }

  const releasePath = `apk_releases/${existing.id}`;
  try {
    await updateDoc(doc(db, 'apk_releases', existing.id), {
      appName,
      packageName,
      versionName,
      versionCode,
      description,
      fileName,
      mimeType,
      byteSize,
      fileSizeLabel: formatBytes(byteSize),
      chunkCount,
      sha256Checksum,
      iconBase64,
      isMain: input.isMain,
      isPublished: input.isPublished,
      updatedAt: serverTimestamp(),
    });
    onProgress?.('Release updated.', 100);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, releasePath);
  }
}

export async function setMainApkRelease(user: User, release: ApkRelease): Promise<void> {
  if (!isVerifiedOwner(user)) {
    throw new Error(`Only verified owner (${OWNER_EMAIL}) can set the main APK.`);
  }
  await demoteOtherMainReleases(release.id);
  const path = `apk_releases/${release.id}`;
  try {
    await updateDoc(doc(db, 'apk_releases', release.id), {
      isMain: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleReleasePublished(
  user: User,
  release: ApkRelease,
  isPublished: boolean
): Promise<void> {
  if (!isVerifiedOwner(user)) {
    throw new Error(`Only verified owner (${OWNER_EMAIL}) can change publish status.`);
  }
  try {
    await updateDoc(doc(db, 'apk_files', release.id), {
      isPublished,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'apk_releases', release.id), {
      isPublished,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `apk_releases/${release.id}`);
  }
}

export async function deleteApkRelease(user: User, release: ApkRelease): Promise<void> {
  if (!isVerifiedOwner(user)) {
    throw new Error(`Only verified owner (${OWNER_EMAIL}) can delete APK releases.`);
  }
  await deleteChunksForRelease(release.id, release.chunkCount);

  try {
    await deleteDoc(doc(db, 'apk_files', release.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `apk_files/${release.id}`);
  }

  try {
    await deleteDoc(doc(db, 'apk_releases', release.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `apk_releases/${release.id}`);
  }
}

// --- Public Unauthenticated APK Download ---

export async function downloadApkRelease(
  release: ApkRelease,
  onProgress?: ProgressCallback
): Promise<{ fileName: string; sha256Verified: boolean; actualSha256: string }> {
  const filePath = `apk_files/${release.id}`;
  onProgress?.('Connecting to APK release storage...', 4);

  let fileSnap;
  try {
    fileSnap = await getDoc(doc(db, 'apk_files', release.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, filePath);
  }

  if (!fileSnap.exists()) {
    throw new Error('APK file payload is unavailable.');
  }

  const fileDoc = mapApkFilePayload(fileSnap.id, fileSnap.data() as Record<string, unknown>);
  const expectedSha = fileDoc.sha256Checksum || release.sha256Checksum;

  let finalBytes: Uint8Array;
  let sha256Verified = false;
  let actualSha256 = '';

  if (fileDoc.chunkCount > 0) {
    onProgress?.(`Downloading ${fileDoc.chunkCount} APK segments...`, 8);
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
          const chunkPath = `apk_files/${fileDoc.id}/chunks/chunk_${chunkIndex}`;
          let chunkSnap;
          try {
            chunkSnap = await getDoc(
              doc(db, 'apk_files', fileDoc.id, 'chunks', `chunk_${chunkIndex}`)
            );
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, chunkPath);
          }
          if (!chunkSnap.exists()) {
            throw new Error(`Missing APK segment chunk_${chunkIndex}.`);
          }
          const data = chunkSnap.data();
          const decrypted = await decryptBytesWithVaultKey(
            String(data.ciphertextBase64 ?? ''),
            String(data.ivBase64 ?? '')
          );
          chunkBuffers[chunkIndex] = decrypted.bytes;
          completed += 1;
          const pct = Math.min(92, Math.round(8 + (completed / fileDoc.chunkCount) * 84));
          onProgress?.(`Downloading APK (${completed}/${fileDoc.chunkCount})...`, pct);
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

    onProgress?.('Verifying APK SHA-256 integrity...', 96);
    actualSha256 = await sha256Hex(finalBytes);
    sha256Verified = expectedSha
      ? actualSha256.toLowerCase() === expectedSha.toLowerCase()
      : true;
  } else {
    onProgress?.('Preparing APK file...', 50);
    const decrypted = await decryptBytesWithVaultKey(
      fileDoc.ciphertextBase64,
      fileDoc.ivBase64,
      expectedSha
    );
    finalBytes = decrypted.bytes;
    sha256Verified = decrypted.checksumVerified;
    actualSha256 = decrypted.actualSha256;
  }

  if (!sha256Verified) {
    throw new Error(
      `SHA-256 verification failed! Expected ${expectedSha}, got ${actualSha256}. Download aborted.`
    );
  }

  onProgress?.('Starting APK download...', 100);
  triggerBrowserFileDownload(
    finalBytes,
    fileDoc.fileName || release.fileName,
    fileDoc.mimeType || 'application/vnd.android.package-archive'
  );

  return {
    fileName: fileDoc.fileName || release.fileName,
    sha256Verified,
    actualSha256,
  };
}
