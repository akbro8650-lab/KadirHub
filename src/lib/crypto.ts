// Android-compatible WebCrypto <-> javax.crypto AES-256-GCM implementation
// Vault Key: 32-byte SHA-256 digest of "KadirHub::@kadirofficial007::AES256GCM::VaultKey::v1"

const VAULT_KEY_SEED = 'KadirHub::@kadirofficial007::AES256GCM::VaultKey::v1';

export interface VaultCipherPayload {
  ciphertextBase64: string;
  ivBase64: string;
  sha256Checksum: string;
  encryptionAlgorithm: 'AES-256-GCM';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

let cachedVaultKeyPromise: Promise<CryptoKey> | null = null;

async function getVaultAesKey(): Promise<CryptoKey> {
  if (!cachedVaultKeyPromise) {
    cachedVaultKeyPromise = (async () => {
      const seedBytes = new TextEncoder().encode(VAULT_KEY_SEED);
      const keyMaterial = await window.crypto.subtle.digest('SHA-256', seedBytes as BufferSource);
      return window.crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    })();
  }
  return cachedVaultKeyPromise;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await window.crypto.subtle.digest('SHA-256', data as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256HexFromText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

export async function encryptBytesWithVaultKey(
  plainBytes: Uint8Array
): Promise<VaultCipherPayload> {
  const key = await getVaultAesKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      tagLength: 128,
    },
    key,
    plainBytes as BufferSource
  );

  const sha256Checksum = await sha256Hex(plainBytes);

  return {
    ciphertextBase64: bytesToBase64(new Uint8Array(encryptedBuffer)),
    ivBase64: bytesToBase64(iv),
    sha256Checksum,
    encryptionAlgorithm: 'AES-256-GCM',
  };
}

export async function encryptTextWithVaultKey(text: string): Promise<VaultCipherPayload> {
  return encryptBytesWithVaultKey(new TextEncoder().encode(text));
}

export async function decryptBytesWithVaultKey(
  ciphertextBase64: string,
  ivBase64: string,
  expectedSha256?: string
): Promise<{ bytes: Uint8Array; checksumVerified: boolean; actualSha256: string }> {
  const key = await getVaultAesKey();
  const iv = base64ToBytes(ivBase64);
  const cipherBytes = base64ToBytes(ciphertextBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      tagLength: 128,
    },
    key,
    cipherBytes as BufferSource
  );

  const bytes = new Uint8Array(decryptedBuffer);
  const actualSha256 = await sha256Hex(bytes);
  const checksumVerified = expectedSha256
    ? actualSha256.toLowerCase() === expectedSha256.toLowerCase()
    : true;

  return { bytes, checksumVerified, actualSha256 };
}

export async function decryptTextWithVaultKey(
  ciphertextBase64: string,
  ivBase64: string,
  expectedSha256?: string
): Promise<{ text: string; checksumVerified: boolean; actualSha256: string }> {
  const result = await decryptBytesWithVaultKey(ciphertextBase64, ivBase64, expectedSha256);
  return {
    text: new TextDecoder().decode(result.bytes),
    checksumVerified: result.checksumVerified,
    actualSha256: result.actualSha256,
  };
}

export function triggerBrowserFileDownload(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string
): void {
  const blob = new Blob([bytes as BlobPart], {
    type: mimeType || 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'kadirhub-download';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
