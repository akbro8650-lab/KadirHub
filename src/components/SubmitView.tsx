import { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Archive,
  CheckCircle2,
  Clock,
  FileLock2,
  Flag,
  ImagePlus,
  Link2,
  Lock,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { decryptTextWithVaultKey, formatBytes } from '@/src/lib/crypto';
import {
  createCatalogItem,
  deleteCatalogItemAndFiles,
  updateCatalogItemByUploader,
} from '@/src/lib/firestoreService';
import { getIconDataUri, processAppIconToWebPBase64 } from '@/src/lib/iconUtils';
import {
  CATEGORIES,
  CatalogCategory,
  CatalogItem,
  CatalogItemType,
  CatalogStatus,
  CREATOR_HANDLE,
  MAX_LENGTHS,
} from '@/src/types/kadirhub';

interface SubmitViewProps {
  user: User | null;
  isAdmin: boolean;
  myUploads: CatalogItem[];
  onSignIn: () => void;
  onSelectItem: (item: CatalogItem) => void;
}

function renderStatusLabel(status: CatalogStatus) {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Approved</span>
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <Clock className="w-3.5 h-3.5" />
          <span>Pending Approval</span>
        </span>
      );
    case 'flagged':
      return (
        <span className="inline-flex items-center gap-1 text-red-700">
          <Flag className="w-3.5 h-3.5" />
          <span>Flagged</span>
        </span>
      );
    case 'archived':
      return (
        <span className="inline-flex items-center gap-1 text-slate-600">
          <Archive className="w-3.5 h-3.5" />
          <span>Archived</span>
        </span>
      );
  }
}

export function SubmitView({
  user,
  isAdmin,
  myUploads,
  onSignIn,
  onSelectItem,
}: SubmitViewProps) {
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CatalogCategory>('App');
  const [version, setVersion] = useState('1.0');
  const [itemType, setItemType] = useState<CatalogItemType>('link');
  const [targetUrl, setTargetUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [iconBase64, setIconBase64] = useState('');
  const [iconError, setIconError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; percent: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-blue-600 mx-auto" />
        <h2 className="font-display text-xl font-bold text-slate-900">
          Upload an App, Tool, or Link to KadirHub
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Sign in with Google to submit apps, links, or encrypted files up to 50 MB. All
          submissions are sealed with AES-256-GCM and SHA-256 checksums for Android and Web.
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

  function resetForm() {
    setEditingItem(null);
    setTitle('');
    setDescription('');
    setCategory('App');
    setVersion('1.0');
    setItemType('link');
    setTargetUrl('');
    setFile(null);
    setIconBase64('');
    setIconError(null);
  }

  async function handleStartEdit(item: CatalogItem) {
    setError(null);
    setSuccessMsg(null);
    setConfirmDeleteId(null);
    setEditingItem(item);
    setTitle(item.title);
    setDescription(item.description);
    setCategory(item.category);
    setVersion(item.version);
    setItemType(item.itemType);
    setFile(null);
    setIconBase64(item.iconBase64 || '');
    setIconError(null);

    if (item.itemType === 'link' && item.encryptedTargetUrl && item.urlIv) {
      try {
        const decrypted = await decryptTextWithVaultKey(item.encryptedTargetUrl, item.urlIv);
        setTargetUrl(decrypted.text);
      } catch {
        setTargetUrl('');
      }
    } else {
      setTargetUrl('');
    }
  }

  async function handleIconSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setIconError(null);
    try {
      const base64 = await processAppIconToWebPBase64(selected);
      setIconBase64(base64);
    } catch (err) {
      setIconError(err instanceof Error ? err.message : 'Unable to process icon image.');
    } finally {
      e.target.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    setUploadProgress({ label: 'Preparing AES-256-GCM payload...', percent: 2 });

    try {
      if (editingItem) {
        await updateCatalogItemByUploader(
          user,
          editingItem,
          {
            title,
            description,
            category,
            itemType,
            version,
            targetUrl,
            newFile: file,
            iconBase64,
          },
          isAdmin,
          (label, percent) => setUploadProgress({ label, percent })
        );
        resetForm();
        setSuccessMsg(
          isAdmin
            ? 'Release updated and synced with KadirHub Firestore.'
            : 'Changes saved. Your updated release has been resubmitted for admin approval.'
        );
      } else {
        await createCatalogItem(
          user,
          {
            title,
            description,
            category,
            itemType,
            version,
            targetUrl,
            file,
            iconBase64,
          },
          isAdmin,
          (label, percent) => setUploadProgress({ label, percent })
        );
        resetForm();
        setSuccessMsg(
          isAdmin
            ? 'Encrypted with AES-256-GCM and published to the approved KadirHub catalog.'
            : 'Encrypted with AES-256-GCM and submitted for admin approval.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save release.');
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  async function handleDeleteUpload(item: CatalogItem) {
    setDeletingId(item.id);
    setError(null);
    setSuccessMsg(null);
    try {
      await deleteCatalogItemAndFiles(item);
      if (editingItem?.id === item.id) {
        resetForm();
      }
      setConfirmDeleteId(null);
      setSuccessMsg(`Deleted "${item.title}" and its encrypted payloads.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete release.');
    } finally {
      setDeletingId(null);
    }
  }

  const iconPreviewUri = getIconDataUri(iconBase64);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          {editingItem ? `Edit Release: ${editingItem.title}` : 'Publish App, File, or Link'}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Releases sync across KadirHub Android & Web under{' '}
          <span className="font-medium text-slate-900">{CREATOR_HANDLE}</span> with AES-256-GCM and
          450 KB chunking up to 50 MB.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
        >
          {editingItem && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
              <span>
                Editing <strong>{editingItem.title}</strong>
                {!isAdmin && ' · Saving edits resets status to Pending Approval.'}
              </span>
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[36px] px-2.5 font-semibold text-blue-700 hover:text-blue-900 shrink-0"
              >
                Cancel Edit
              </button>
            </div>
          )}

          {!editingItem && !isAdmin && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Community submissions start in <strong>Pending Approval</strong> and appear in the
                public Explore directory once approved by an admin.
              </span>
            </div>
          )}

          {/* App Icon Picker */}
          <div className="flex flex-wrap items-center gap-4 pb-2 border-b border-slate-100">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {iconPreviewUri ? (
                <img
                  src={iconPreviewUri}
                  alt="App icon preview"
                  className="w-full h-full object-cover"
                />
              ) : itemType === 'encrypted_file' ? (
                <FileLock2 className="w-6 h-6 text-slate-400" />
              ) : (
                <Link2 className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <label className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg cursor-pointer transition-colors">
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>{iconPreviewUri ? 'Change App Icon' : 'Upload App Icon'}</span>
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
                    className="min-h-[44px] inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-600"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Auto-cropped to 160×160 WebP for Android & Web cards.
              </p>
            </div>
          </div>
          {iconError && <p className="text-xs font-medium text-red-600">{iconError}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                required
                minLength={1}
                maxLength={MAX_LENGTHS.title}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., KadirHub Companion"
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Version</label>
              <input
                type="text"
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

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
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Description ({description.length}/{MAX_LENGTHS.description})
            </label>
            <textarea
              rows={4}
              required
              minLength={1}
              maxLength={MAX_LENGTHS.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe features, usage notes, and platform compatibility..."
              className="w-full px-3 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <span className="block text-xs font-medium text-slate-700">Payload Type</span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setItemType('link')}
                className={`min-h-[44px] sm:min-h-[36px] py-1.5 text-xs font-medium rounded-md transition-colors ${
                  itemType === 'link' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Encrypted Link
              </button>
              <button
                type="button"
                onClick={() => setItemType('encrypted_file')}
                className={`min-h-[44px] sm:min-h-[36px] py-1.5 text-xs font-medium rounded-md transition-colors ${
                  itemType === 'encrypted_file'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Encrypted File (≤ 50 MB)
              </button>
            </div>

            {itemType === 'link' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target URL (sealed with AES-256-GCM)
                </label>
                <input
                  type="url"
                  required={itemType === 'link' && (!editingItem || editingItem.itemType !== 'link')}
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com/download/app.apk"
                  className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {editingItem?.itemType === 'link' && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Leave as-is or blank to preserve the existing encrypted link.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="min-h-[60px] flex items-center justify-center gap-2 px-4 py-4 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors text-xs text-slate-600">
                  <Upload className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate">
                    {file
                      ? `${file.name} (${formatBytes(file.size)})`
                      : editingItem?.itemType === 'encrypted_file'
                        ? `Current file: ${editingItem.fileSizeLabel} · Tap to replace (max 50 MB)`
                        : `Attach file (up to ${formatBytes(MAX_LENGTHS.maxFileBytes)})`}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            )}
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

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Automatically encrypted with KadirHub AES-256-GCM VaultKey & SHA-256</span>
          </div>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          {successMsg && <p className="text-xs font-medium text-emerald-700">{successMsg}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {submitting
              ? 'Encrypting & Uploading...'
              : editingItem
                ? 'Save Changes & Encrypt'
                : 'Encrypt & Publish Release'}
          </button>
        </form>

        {/* My Uploaded Releases */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              My Uploaded Releases
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">{myUploads.length}</span>
          </div>

          {myUploads.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
              Releases you upload from this Google account will appear here with approval status
              and edit controls.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {myUploads.map((item) => {
                const iconUri = getIconDataUri(item.iconBase64);
                const isConfirmingDelete = confirmDeleteId === item.id;
                return (
                  <div key={item.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                        {iconUri ? (
                          <img
                            src={iconUri}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : item.itemType === 'encrypted_file' ? (
                          <FileLock2 className="w-4 h-4 text-slate-500" />
                        ) : (
                          <Link2 className="w-4 h-4 text-slate-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectItem(item)}
                            className="text-left min-w-0 hover:underline"
                          >
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {item.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item.category} · v{item.version} · {item.fileSizeLabel}
                            </p>
                          </button>
                          <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                            {item.downloadCount} dl
                          </span>
                        </div>

                        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs font-medium">
                          {renderStatusLabel(item.status)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => handleDeleteUpload(item)}
                            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors"
                          >
                            {deletingId === item.id ? 'Deleting...' : 'Confirm Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[44px] sm:min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
