import { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Clock,
  Download,
  FileLock2,
  ImagePlus,
  Lock,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { formatBytes } from '@/src/lib/crypto';
import {
  createCatalogItem,
  decryptAndDownloadCatalogItem,
} from '@/src/lib/firestoreService';
import { getIconDataUri, processAppIconToWebPBase64 } from '@/src/lib/iconUtils';
import {
  CATEGORIES,
  CatalogCategory,
  CatalogItem,
  MAX_LENGTHS,
} from '@/src/types/kadirhub';

interface VaultViewProps {
  user: User | null;
  isAdmin: boolean;
  encryptedItems: CatalogItem[];
  loading: boolean;
  onSignIn: () => void;
}

export function VaultView({
  user,
  isAdmin,
  encryptedItems,
  loading,
  onSignIn,
}: VaultViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CatalogCategory>('Resource');
  const [version, setVersion] = useState('1.0');
  const [file, setFile] = useState<File | null>(null);
  const [iconBase64, setIconBase64] = useState('');
  const [iconError, setIconError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; percent: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    id: string;
    label: string;
    percent: number;
  } | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-blue-600 mx-auto" />
        <h2 className="font-display text-xl font-bold text-slate-900">
          AES-256-GCM Encrypted File Storage
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Sign in with Google to browse, decrypt, and upload AES-256-GCM encrypted files (up to 50
          MB) synced with KadirHub Firestore.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  async function handleIconSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setIconError(null);
    try {
      const base64 = await processAppIconToWebPBase64(selected);
      setIconBase64(base64);
    } catch (err) {
      setIconError(err instanceof Error ? err.message : 'Unable to process icon.');
    } finally {
      e.target.value = '';
    }
  }

  async function handleUploadEncryptedFile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    setUploadProgress({ label: 'Preparing file...', percent: 2 });
    try {
      await createCatalogItem(
        user,
        {
          title,
          description,
          category,
          itemType: 'encrypted_file',
          version,
          file,
          iconBase64,
        },
        isAdmin,
        (label, percent) => setUploadProgress({ label, percent })
      );
      setTitle('');
      setDescription('');
      setFile(null);
      setIconBase64('');
      setSuccess(
        isAdmin
          ? 'Encrypted with AES-256-GCM and published to the approved KadirHub vault.'
          : 'Encrypted with AES-256-GCM and queued for admin approval.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to encrypt and upload file.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleDownloadFile(item: CatalogItem) {
    setDownloadingId(item.id);
    setDownloadMsg(null);
    setDownloadProgress({ id: item.id, label: 'Fetching encrypted payload...', percent: 5 });
    try {
      const res = await decryptAndDownloadCatalogItem(item, (label, percent) =>
        setDownloadProgress({ id: item.id, label, percent })
      );
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
      setDownloadProgress(null);
    }
  }

  const iconPreviewUri = getIconDataUri(iconBase64);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            AES-256-GCM Encrypted File Vault
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Files up to 50 MB are sealed with KadirHub VaultKey (12-byte random IV, 128-bit GCM
            tag, 450 KB chunks, full-file SHA-256 integrity).
          </p>
        </div>
        <span className="text-xs font-mono text-slate-600 tabular-nums">
          {encryptedItems.length} encrypted file{encryptedItems.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleUploadEncryptedFile}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Encrypt & Upload File
            </h2>
            <ShieldCheck className="w-4 h-4 text-blue-600" />
          </div>

          {!isAdmin && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Community uploads enter <strong>Pending Approval</strong> until reviewed by an admin.
              </span>
            </div>
          )}

          {/* Optional WebP App Icon */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {iconPreviewUri ? (
                <img
                  src={iconPreviewUri}
                  alt="App icon preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <FileLock2 className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <label className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg cursor-pointer transition-colors">
                <ImagePlus className="w-3.5 h-3.5" />
                <span>{iconPreviewUri ? 'Change Icon' : 'Add App Icon'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleIconSelect}
                />
              </label>
              {iconPreviewUri && (
                <button
                  type="button"
                  onClick={() => setIconBase64('')}
                  className="min-h-[44px] inline-flex items-center gap-1 px-2.5 py-2 text-xs text-slate-500 hover:text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>
          {iconError && <p className="text-xs font-medium text-red-600">{iconError}</p>}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              required
              maxLength={MAX_LENGTHS.title}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., KadirHub Toolkit Bundle"
              className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CatalogCategory)}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              className="w-full px-3 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              File (Max {formatBytes(MAX_LENGTHS.maxFileBytes)} · 450 KB auto-chunked)
            </label>
            <label className="min-h-[60px] flex items-center justify-center gap-2 px-4 py-4 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors text-xs text-slate-600">
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

          {uploadProgress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="truncate">{uploadProgress.label}</span>
                <span className="font-mono tabular-nums">{uploadProgress.percent}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          {success && <p className="text-xs font-medium text-emerald-700">{success}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="w-full min-h-[44px] py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {uploading ? 'Encrypting & Uploading...' : 'Encrypt & Store File'}
          </button>
        </form>

        <div className="lg:col-span-7 space-y-4">
          {downloadMsg && (
            <div className="bg-slate-900 text-white text-xs px-4 py-3 rounded-lg flex items-center justify-between">
              <span>{downloadMsg}</span>
              <button
                type="button"
                onClick={() => setDownloadMsg(null)}
                className="text-slate-300 hover:text-white ml-3 min-h-[36px] px-2"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : encryptedItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <FileLock2 className="w-7 h-7 text-slate-400 mx-auto" />
              <h3 className="font-display text-base font-semibold text-slate-900">
                No encrypted files stored yet
              </h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Approved files encrypted from either KadirHub Android or KadirHub Web will appear
                here for AES-256-GCM decryption and direct download.
              </p>
            </div>
          ) : (
            encryptedItems.map((item) => {
              const iconUri = getIconDataUri(item.iconBase64);
              const isDownloading = downloadingId === item.id;
              return (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                        {iconUri ? (
                          <img
                            src={iconUri}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FileLock2 className="w-5 h-5 text-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-bold text-slate-900 truncate">
                          {item.title}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span>{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{item.fileSizeLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[140px]">by {item.uploaderName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{item.downloadCount} downloads</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleDownloadFile(item)}
                      className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isDownloading ? 'Decrypting...' : 'Decrypt & Download'}</span>
                    </button>
                  </div>

                  {downloadProgress && downloadProgress.id === item.id && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="truncate">{downloadProgress.label}</span>
                        <span className="font-mono tabular-nums">{downloadProgress.percent}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-200"
                          style={{ width: `${downloadProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedFileId((cur) => (cur === item.id ? null : item.id))
                      }
                      className="min-h-[36px] text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
