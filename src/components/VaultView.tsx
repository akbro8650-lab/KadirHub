import { useState } from 'react';
import { User } from 'firebase/auth';
import { Download, FileLock2, Lock, ShieldCheck, Upload } from 'lucide-react';
import { formatBytes } from '@/src/lib/crypto';
import {
  createCatalogItem,
  decryptAndDownloadCatalogItem,
} from '@/src/lib/firestoreService';
import {
  CATEGORIES,
  CatalogCategory,
  CatalogItem,
  MAX_LENGTHS,
} from '@/src/types/kadirhub';

interface VaultViewProps {
  user: User | null;
  encryptedItems: CatalogItem[];
  loading: boolean;
  onSignIn: () => void;
}

export function VaultView({ user, encryptedItems, loading, onSignIn }: VaultViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CatalogCategory>('Resource');
  const [version, setVersion] = useState('1.0');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-blue-600 mx-auto" />
        <h2 className="font-display text-xl font-bold text-slate-900">
          AES-256-GCM Encrypted File Storage
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Sign in with Google to browse, decrypt, and upload AES-256-GCM encrypted files synced with
          KadirHub Firestore.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  async function handleUploadEncryptedFile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    try {
      await createCatalogItem(user, {
        title,
        description,
        category,
        itemType: 'encrypted_file',
        version,
        file,
      });
      setTitle('');
      setDescription('');
      setFile(null);
      setSuccess('Encrypted with AES-256-GCM and stored in /encrypted_files & /catalog_items.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to encrypt and upload file.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadFile(item: CatalogItem) {
    setDownloadingId(item.id);
    setDownloadMsg(null);
    try {
      const res = await decryptAndDownloadCatalogItem(item);
      setDownloadMsg(
        `Decrypted ${res.fileName || item.title} (${
          res.checksumVerified ? 'SHA-256 Verified' : 'Checksum Notice'
        })`
      );
    } catch (err) {
      setDownloadMsg(
        err instanceof Error ? err.message : 'Decryption failed for encrypted file.'
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            AES-256-GCM Encrypted File Storage
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Files in <span className="font-mono">/encrypted_files</span> are sealed with the
            cross-platform KadirHub VaultKey (12-byte random IV, 128-bit GCM auth tag, SHA-256
            integrity checksum).
          </p>
        </div>
        <span className="text-xs font-mono text-slate-600 tabular-nums">
          {encryptedItems.length} encrypted file{encryptedItems.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleUploadEncryptedFile}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Encrypt & Upload File
            </h2>
            <ShieldCheck className="w-4 h-4 text-blue-600" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              required
              maxLength={MAX_LENGTHS.title}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., KadirHub Toolkit Bundle"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CatalogCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Version</label>
              <input
                type="text"
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              required
              maxLength={MAX_LENGTHS.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this encrypted file..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              File (Max {formatBytes(MAX_LENGTHS.maxFileBytes)})
            </label>
            <label className="flex items-center justify-center gap-2 px-4 py-5 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors text-xs text-slate-600">
              <Upload className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate">
                {file ? `${file.name} (${formatBytes(file.size)})` : 'Choose file to encrypt...'}
              </span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          {success && <p className="text-xs font-medium text-emerald-700">{success}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {uploading ? 'Encrypting & Uploading...' : 'Encrypt & Store File'}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-4">
          {downloadMsg && (
            <div className="bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
              <span>{downloadMsg}</span>
              <button
                type="button"
                onClick={() => setDownloadMsg(null)}
                className="text-slate-300 hover:text-white ml-3"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : encryptedItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <FileLock2 className="w-7 h-7 text-slate-400 mx-auto" />
              <h3 className="font-display text-base font-semibold text-slate-900">
                No encrypted files stored yet
              </h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Files encrypted from either KadirHub Android or KadirHub Web will appear here for
                AES-256-GCM decryption and direct download.
              </p>
            </div>
          ) : (
            encryptedItems.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold text-slate-900 truncate">
                      {item.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{item.fileSizeLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{item.encryptionAlgorithm}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{item.downloadCount} downloads</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={downloadingId === item.id}
                    onClick={() => handleDownloadFile(item)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloadingId === item.id ? 'Decrypting...' : 'Decrypt & Download'}</span>
                  </button>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedFileId((cur) => (cur === item.id ? null : item.id))
                    }
                    className="text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
                  >
                    {expandedFileId === item.id
                      ? 'Hide Cryptographic Metadata'
                      : 'Inspect AES-256-GCM & SHA-256'}
                  </button>
                  {expandedFileId === item.id && (
                    <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-600 space-y-1 break-all">
                      <div>Catalog Item ID: {item.id}</div>
                      <div>Encrypted File ID: {item.encryptedFileId}</div>
                      <div>SHA-256: {item.sha256Checksum}</div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
