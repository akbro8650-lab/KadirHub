import { useState } from 'react';
import { User } from 'firebase/auth';
import { CheckCircle2, Flag, Lock, ShieldCheck, Upload } from 'lucide-react';
import { formatBytes } from '@/src/lib/crypto';
import { createCatalogItem } from '@/src/lib/firestoreService';
import {
  CATEGORIES,
  CatalogCategory,
  CatalogItem,
  CatalogItemType,
  CREATOR_HANDLE,
  MAX_LENGTHS,
} from '@/src/types/kadirhub';

interface SubmitViewProps {
  user: User | null;
  myUploads: CatalogItem[];
  onSignIn: () => void;
  onSelectItem: (item: CatalogItem) => void;
}

export function SubmitView({ user, myUploads, onSignIn, onSelectItem }: SubmitViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CatalogCategory>('App');
  const [version, setVersion] = useState('1.0');
  const [itemType, setItemType] = useState<CatalogItemType>('link');
  const [targetUrl, setTargetUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-blue-600 mx-auto" />
        <h2 className="font-display text-xl font-bold text-slate-900">
          Upload an App, Tool, or Link to KadirHub
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Sign in with Google to publish directly to the shared KadirHub catalog. Links and files
          are sealed with AES-256-GCM and SHA-256 checksums for both web and Android.
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      await createCatalogItem(user, {
        title,
        description,
        category,
        itemType,
        version,
        targetUrl,
        file,
      });

      setTitle('');
      setDescription('');
      setTargetUrl('');
      setFile(null);
      setSuccessMsg(
        'Encrypted with AES-256-GCM and published to the shared KadirHub Firestore catalog.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Publish App, File, or Encrypted Link
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Published releases sync immediately with KadirHub Android & Web under{' '}
          <span className="font-medium text-slate-900">{CREATOR_HANDLE}</span> using AES-256-GCM.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
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
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

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
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <span className="block text-xs font-medium text-slate-700">Payload Type</span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setItemType('link')}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                  itemType === 'link' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Encrypted Link / Direct URL
              </button>
              <button
                type="button"
                onClick={() => setItemType('encrypted_file')}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                  itemType === 'encrypted_file'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Encrypted File Upload
              </button>
            </div>

            {itemType === 'link' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target URL (sealed with AES-256-GCM)
                </label>
                <input
                  type="url"
                  required={itemType === 'link'}
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com/download/app.apk"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-5 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors text-xs text-slate-600">
                <Upload className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="truncate">
                  {file
                    ? `${file.name} (${formatBytes(file.size)})`
                    : `Attach file (up to ${formatBytes(MAX_LENGTHS.maxFileBytes)})`}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Automatically encrypted with KadirHub AES-256-GCM VaultKey & SHA-256</span>
          </div>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          {successMsg && <p className="text-xs font-medium text-emerald-700">{successMsg}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {submitting ? 'Encrypting & Publishing...' : 'Encrypt & Publish Release'}
          </button>
        </form>

        {/* My Uploaded Releases */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              My Uploaded Releases
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">{myUploads.length}</span>
          </div>

          {myUploads.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
              Releases you upload from this Google account will appear here.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {myUploads.map((item) => (
                <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className="text-left min-w-0 hover:underline"
                    >
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                      <p className="text-xs text-slate-500">
                        {item.category} · v{item.version} · {item.fileSizeLabel}
                      </p>
                    </button>
                    <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                      {item.downloadCount} dl
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {item.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approved</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <Flag className="w-3.5 h-3.5" />
                        <span className="capitalize">{item.status}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
