import { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ImagePlus,
  Package,
  Pencil,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { formatBytes } from '@/src/lib/crypto';
import {
  createApkRelease,
  deleteApkRelease,
  setMainApkRelease,
  toggleReleasePublished,
  updateApkRelease,
} from '@/src/lib/firestoreService';
import { getIconDataUri, processAppIconToWebPBase64 } from '@/src/lib/iconUtils';
import { APK_LIMITS, ApkRelease } from '@/src/types/kadirhub';

interface OwnerReleaseManagerProps {
  user: User;
  releases: ApkRelease[];
}

export function OwnerReleaseManager({ user, releases }: OwnerReleaseManagerProps) {
  const nextSuggestedVersionCode = useMemo(() => {
    const maxCode = releases.reduce((max, r) => Math.max(max, r.versionCode), 0);
    return maxCode + 1;
  }, [releases]);

  const latestAppDefaults = useMemo(() => {
    const main = releases.find((r) => r.isMain) || releases[0];
    return {
      appName: main?.appName || 'KadirHub',
      packageName: main?.packageName || '',
      iconBase64: main?.iconBase64 || '',
    };
  }, [releases]);

  const [editingRelease, setEditingRelease] = useState<ApkRelease | null>(null);

  const [appName, setAppName] = useState(latestAppDefaults.appName);
  const [packageName, setPackageName] = useState(latestAppDefaults.packageName);
  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState<string>(String(nextSuggestedVersionCode));
  const [description, setDescription] = useState('');
  const [iconBase64, setIconBase64] = useState(latestAppDefaults.iconBase64);
  const [iconError, setIconError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isMain, setIsMain] = useState(true);
  const [isPublished, setIsPublished] = useState(true);

  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; percent: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function resetToNewRelease() {
    setEditingRelease(null);
    setAppName(latestAppDefaults.appName);
    setPackageName(latestAppDefaults.packageName);
    setVersionName('');
    setVersionCode(String(nextSuggestedVersionCode));
    setDescription('');
    setIconBase64(latestAppDefaults.iconBase64);
    setIconError(null);
    setFile(null);
    setIsMain(true);
    setIsPublished(true);
  }

  function handleStartEdit(rel: ApkRelease) {
    setError(null);
    setSuccess(null);
    setConfirmDeleteId(null);
    setEditingRelease(rel);
    setAppName(rel.appName);
    setPackageName(rel.packageName);
    setVersionName(rel.versionName);
    setVersionCode(String(rel.versionCode));
    setDescription(rel.description);
    setIconBase64(rel.iconBase64 || '');
    setIconError(null);
    setFile(null);
    setIsMain(rel.isMain);
    setIsPublished(rel.isPublished);
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
    setError(null);
    setSuccess(null);

    const parsedCode = Number.parseInt(versionCode, 10);
    if (!Number.isFinite(parsedCode) || parsedCode < 1) {
      setError('Version code must be a positive integer (e.g., 1, 2, 10).');
      return;
    }

    if (!editingRelease && !file) {
      setError('Please choose an .apk file to upload.');
      return;
    }

    setSaving(true);
    setUploadProgress({ label: 'Preparing APK upload...', percent: 2 });

    try {
      if (editingRelease) {
        await updateApkRelease(
          user,
          editingRelease,
          {
            appName,
            packageName,
            versionName,
            versionCode: parsedCode,
            description,
            iconBase64,
            isMain,
            isPublished,
            file,
          },
          (label, percent) => setUploadProgress({ label, percent })
        );
        setSuccess(`Updated release v${versionName} (Build ${parsedCode}).`);
        resetToNewRelease();
      } else {
        await createApkRelease(
          user,
          {
            appName,
            packageName,
            versionName,
            versionCode: parsedCode,
            description,
            iconBase64,
            isMain,
            isPublished,
            file,
          },
          (label, percent) => setUploadProgress({ label, percent })
        );
        setSuccess(`Published APK v${versionName} (Build ${parsedCode}).`);
        resetToNewRelease();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save APK release.');
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }

  async function handlePromoteMain(rel: ApkRelease) {
    setBusyId(rel.id);
    setError(null);
    setSuccess(null);
    try {
      await setMainApkRelease(user, rel);
      setSuccess(`v${rel.versionName} is now the Main APK download.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to set main APK.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleTogglePublish(rel: ApkRelease) {
    setBusyId(rel.id);
    setError(null);
    setSuccess(null);
    try {
      await toggleReleasePublished(user, rel, !rel.isPublished);
      setSuccess(
        !rel.isPublished
          ? `Published v${rel.versionName} for public download.`
          : `Unpublished v${rel.versionName}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update publish state.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(rel: ApkRelease) {
    setBusyId(rel.id);
    setError(null);
    setSuccess(null);
    try {
      await deleteApkRelease(user, rel);
      if (editingRelease?.id === rel.id) {
        resetToNewRelease();
      }
      setConfirmDeleteId(null);
      setSuccess(`Deleted APK release v${rel.versionName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete release.');
    } finally {
      setBusyId(null);
    }
  }

  const iconPreviewUri = getIconDataUri(iconBase64);

  return (
    <section
      id="owner-panel"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Owner Console Active · {user.email}</span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {editingRelease
              ? `Edit APK Release v${editingRelease.versionName}`
              : 'Upload Main APK or Publish Update'}
          </h2>
        </div>

        {editingRelease && (
          <button
            type="button"
            onClick={resetToNewRelease}
            className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel Edit
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Upload / Update Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-4">
          {/* App Icon Picker */}
          <div className="flex flex-wrap items-center gap-4 pb-3 border-b border-slate-100">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {iconPreviewUri ? (
                <img
                  src={iconPreviewUri}
                  alt="App icon preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-6 h-6 text-slate-400" />
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
                Optional app icon (auto-cropped 160×160 WebP).
              </p>
            </div>
          </div>
          {iconError && <p className="text-xs font-medium text-red-600">{iconError}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">App Name</label>
              <input
                type="text"
                required
                maxLength={APK_LIMITS.appName}
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="KadirHub"
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Package Name (optional)
              </label>
              <input
                type="text"
                maxLength={APK_LIMITS.packageName}
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder="com.kadirhub.app"
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                APK Version Name
              </label>
              <input
                type="text"
                required
                maxLength={APK_LIMITS.versionName}
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g., 1.2.0"
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Build / Version Code
              </label>
              <input
                type="number"
                required
                min={1}
                max={999999999}
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value)}
                placeholder="e.g., 12"
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Release Description & What&apos;s New ({description.length}/{APK_LIMITS.description})
            </label>
            <textarea
              rows={4}
              required
              maxLength={APK_LIMITS.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what's new in this APK version, bug fixes, Android compatibility, and install notes..."
              className="w-full px-3 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              APK File (up to {formatBytes(APK_LIMITS.maxApkBytes)} · 450 KB segmented)
            </label>
            <label className="min-h-[64px] flex items-center justify-center gap-2 px-4 py-4 border border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors text-xs text-slate-700">
              <Upload className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate">
                {file
                  ? `${file.name} (${formatBytes(file.size)})`
                  : editingRelease
                    ? `Current APK: ${editingRelease.fileName} (${editingRelease.fileSizeLabel}) · Tap to replace`
                    : 'Choose .apk file to upload...'}
              </span>
              <input
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <label className="min-h-[44px] inline-flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isMain}
                onChange={(e) => setIsMain(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>Set as Main APK Download</span>
            </label>

            <label className="min-h-[44px] inline-flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>Published for public download</span>
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
          {success && (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[48px] py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors"
          >
            {saving
              ? 'Uploading & Verifying APK...'
              : editingRelease
                ? 'Save APK Update'
                : 'Upload & Publish APK'}
          </button>
        </form>

        {/* Uploaded Releases Management List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Uploaded APK Versions
            </h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {releases.length} version{releases.length === 1 ? '' : 's'}
            </span>
          </div>

          {releases.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-sm text-slate-500">
              No APK releases uploaded yet. Upload your main APK using the form.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4">
              {releases.map((rel) => {
                const isConfirming = confirmDeleteId === rel.id;
                const isBusy = busyId === rel.id;
                return (
                  <div key={rel.id} className="py-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-sm font-bold text-slate-900">
                            {rel.appName} v{rel.versionName}
                          </span>
                          {rel.isMain && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                              <Star className="w-3 h-3 fill-blue-600 text-blue-600" />
                              <span>Main APK</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          Build {rel.versionCode} · {rel.fileSizeLabel} ·{' '}
                          {rel.isPublished ? 'Public' : 'Hidden'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!rel.isMain && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handlePromoteMain(rel)}
                          className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          Set as Main
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStartEdit(rel)}
                        className="min-h-[40px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleTogglePublish(rel)}
                        className="min-h-[40px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        {rel.isPublished ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hide</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Publish</span>
                          </>
                        )}
                      </button>

                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDelete(rel)}
                            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[40px] px-2 text-xs text-slate-500"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(rel.id)}
                          className="min-h-[40px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
    </section>
  );
}
