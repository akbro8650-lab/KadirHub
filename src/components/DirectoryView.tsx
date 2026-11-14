import { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageSquare,
  PackagePlus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { StarRatingDisplay } from '@/src/components/StarRating';
import { decryptAndDownloadCatalogItem } from '@/src/lib/firestoreService';
import { ASSET_IMAGES } from '@/src/lib/seedCatalog';
import {
  CATEGORIES,
  CatalogCategory,
  CatalogItem,
  CREATOR_HANDLE,
  ViewTab,
} from '@/src/types/kadirhub';

interface DirectoryViewProps {
  items: CatalogItem[];
  loading: boolean;
  user: User | null;
  onSelectItem: (item: CatalogItem) => void;
  onNavigate: (tab: ViewTab) => void;
  onSignIn: () => void;
}

type SortMode = 'newest' | 'rating' | 'downloads';

function getCategoryCover(category: CatalogCategory): string | null {
  if (category === 'App' || category === 'Game') return ASSET_IMAGES.heroStudio;
  if (category === 'Tool' || category === 'Resource') return ASSET_IMAGES.thumbUtility;
  if (category === 'Link') return ASSET_IMAGES.thumbVault;
  return null;
}

export function DirectoryView({
  items,
  loading,
  user,
  onSelectItem,
  onNavigate,
  onSignIn,
}: DirectoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | CatalogCategory>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const [quickStatus, setQuickStatus] = useState<{
    itemId: string;
    message: string;
    linkUrl?: string;
    verified: boolean;
  } | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);

  const stats = useMemo(() => {
    const totalDownloads = items.reduce((sum, item) => sum + item.downloadCount, 0);
    const rated = items.filter((item) => item.reviewCount > 0);
    const avgRating =
      rated.length > 0
        ? rated.reduce((sum, item) => sum + item.averageRating, 0) / rated.length
        : 0;
    return {
      totalItems: items.length,
      totalDownloads,
      avgRating,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((item) => {
        if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.creatorHandle.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortMode === 'rating') {
          if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
          return b.reviewCount - a.reviewCount;
        }
        if (sortMode === 'downloads') {
          return b.downloadCount - a.downloadCount;
        }
        return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
      });
  }, [items, searchQuery, selectedCategory, sortMode]);

  async function handleQuickAction(item: CatalogItem) {
    setBusyId(item.id);
    setQuickError(null);
    try {
      const res = await decryptAndDownloadCatalogItem(item);
      if (res.type === 'link' && res.url) {
        setQuickStatus({
          itemId: item.id,
          message: `Decrypted link for ${item.title}`,
          linkUrl: res.url,
          verified: res.checksumVerified,
        });
      } else {
        setQuickStatus({
          itemId: item.id,
          message: `Downloaded ${res.fileName || item.title}`,
          verified: res.checksumVerified,
        });
      }
    } catch (err) {
      setQuickError(
        err instanceof Error ? err.message : 'Unable to decrypt item with KadirHub VaultKey.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyUrl(itemId: string, url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedId(itemId);
    setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <div className="space-y-8">
      {/* Creator Spotlight Hero */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {avatarFailed ? (
                  <div className="w-11 h-11 rounded-full bg-slate-900 text-white font-display font-bold flex items-center justify-center text-sm shrink-0">
                    K
                  </div>
                ) : (
                  <img
                    src={ASSET_IMAGES.creatorAvatar}
                    alt="Kadir creator portrait"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    Curated by {CREATOR_HANDLE}
                  </p>
                  <p className="text-xs text-slate-500">
                    Synced with KadirHub Firestore · Android & Web Cross-Compatible
                  </p>
                </div>
              </div>

              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance max-w-2xl">
                Direct app downloads and encrypted links in one trusted hub.
              </h1>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                Browse apps, tools, games, resources, and direct links published by{' '}
                <span className="font-medium text-slate-900">{CREATOR_HANDLE}</span>. Every payload
                is sealed with AES-256-GCM and verified with SHA-256 checksums across web and mobile.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('submit')}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Upload App or Link
              </button>
              <button
                type="button"
                onClick={() => onNavigate('vault')}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Encrypted Files Vault
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[240px] bg-slate-900">
            {heroFailed ? (
              <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-300 text-sm p-6">
                KadirHub Distribution Studio
              </div>
            ) : (
              <img
                src={ASSET_IMAGES.heroStudio}
                alt="KadirHub developer hardware studio desk"
                referrerPolicy="no-referrer"
                onError={() => setHeroFailed(true)}
                className="w-full h-full lg:h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5 text-white">
              <p className="text-xs font-mono text-slate-200">
                AES-256-GCM · SHA-256 Verified · Shared Firestore Sync
              </p>
              <p className="text-sm font-semibold mt-0.5">
                {CREATOR_HANDLE} Official Distribution Channel
              </p>
            </div>
          </div>
        </div>

        {/* 4-column metrics strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-200 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-slate-50/70">
          <div className="px-6 py-4">
            <p className="text-xs text-slate-500">Approved Releases</p>
            <p className="mt-1 text-xl font-display font-bold text-slate-900 tabular-nums">
              {stats.totalItems}
            </p>
          </div>
          <div className="px-6 py-4 border-l border-slate-200 lg:border-l-0">
            <p className="text-xs text-slate-500">Total Direct Downloads</p>
            <p className="mt-1 text-xl font-display font-bold text-slate-900 tabular-nums">
              {stats.totalDownloads.toLocaleString()}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="text-xs text-slate-500">Community Rating Avg</p>
            <p className="mt-1 text-xl font-display font-bold text-slate-900 tabular-nums">
              {stats.avgRating > 0 ? `${stats.avgRating.toFixed(1)} / 5.0` : 'No ratings yet'}
            </p>
          </div>
          <div className="px-6 py-4 border-l border-slate-200 lg:border-l-0">
            <p className="text-xs text-slate-500">Cipher Standard</p>
            <p className="mt-1 text-xl font-display font-bold text-slate-900 font-mono">
              AES-256-GCM
            </p>
          </div>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <section aria-label="Directory filters" className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search apps, tools, links..."
                aria-label="Search directory"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              aria-label="Sort directory"
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="newest">Newest Releases</option>
              <option value="rating">Highest Rated</option>
              <option value="downloads">Most Downloaded</option>
            </select>
          </div>
        </div>

        {quickError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs font-medium text-red-700 flex items-center justify-between">
            <span>{quickError}</span>
            <button type="button" onClick={() => setQuickError(null)} className="underline ml-3">
              Dismiss
            </button>
          </div>
        )}

        {quickStatus && (
          <div className="bg-white border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{quickStatus.message}</span>
              <span className="text-slate-500">
                ({quickStatus.verified ? 'SHA-256 Verified' : 'Checksum Notice'})
              </span>
              {quickStatus.linkUrl && (
                <a
                  href={quickStatus.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-700 hover:underline inline-flex items-center gap-1 break-all"
                >
                  <span>{quickStatus.linkUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              {quickStatus.linkUrl && (
                <button
                  type="button"
                  onClick={() => handleCopyUrl(quickStatus.itemId, quickStatus.linkUrl!)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                >
                  {copiedId === quickStatus.itemId ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedId === quickStatus.itemId ? 'Copied' : 'Copy Link'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setQuickStatus(null)}
                className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Catalog Grid */}
      {!user ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <ShieldCheck className="w-8 h-8 text-blue-600 mx-auto" />
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Sign in with Google to view KadirHub Directory
            </h2>
            <p className="text-sm text-slate-500">
              Your shared Firestore database requires Google authentication to list approved
              releases, decrypt downloads, and post 5-star reviews.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignIn}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-64 bg-white border border-slate-200 rounded-xl p-5 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-5 w-2/3 bg-slate-200 rounded" />
                <div className="h-3 w-1/2 bg-slate-100 rounded" />
                <div className="h-12 w-full bg-slate-100 rounded" />
              </div>
              <div className="h-9 w-full bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <PackagePlus className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {items.length === 0 ? 'No approved items in directory' : 'No matching releases found'}
            </h2>
            <p className="text-sm text-slate-500">
              {items.length === 0
                ? 'Upload a new app, encrypted file, or link to publish to KadirHub.'
                : 'Try adjusting your search term or category filter.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {items.length === 0 && !user ? (
              <button
                type="button"
                onClick={onSignIn}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Sign in with Google
              </button>
            ) : items.length === 0 ? (
              <button
                type="button"
                onClick={() => onNavigate('submit')}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Upload First App or Link
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => {
            const cover = getCategoryCover(item.category);
            return (
              <article
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between transition-colors hover:border-slate-300"
              >
                <div>
                  {cover && (
                    <div className="h-32 bg-slate-100 border-b border-slate-200 overflow-hidden">
                      <img
                        src={cover}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-5 space-y-3">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900 leading-snug">
                        {item.title}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">v{item.version}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{item.fileSizeLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.creatorHandle}</span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
                      {item.description}
                    </p>

                    <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                      <StarRatingDisplay rating={item.averageRating} count={item.reviewCount} />
                      <span className="tabular-nums">
                        {item.downloadCount.toLocaleString()} downloads
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => handleQuickAction(item)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {busyId === item.id
                        ? 'Decrypting...'
                        : item.itemType === 'encrypted_file'
                        ? 'Download File'
                        : 'Open Link'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Reviews & Info</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
