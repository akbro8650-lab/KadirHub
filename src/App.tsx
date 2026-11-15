import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Package,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { OwnerReleaseManager } from '@/src/components/OwnerReleaseManager';
import { TopBar } from '@/src/components/TopBar';
import { auth, googleProvider } from '@/src/lib/firebase';
import {
  downloadApkRelease,
  isVerifiedOwner,
  subscribeAllApkReleasesOwner,
  subscribePublishedApkReleases,
} from '@/src/lib/firestoreService';
import { getIconDataUri } from '@/src/lib/iconUtils';
import { ApkRelease, CREATOR_HANDLE, OWNER_EMAIL } from '@/src/types/kadirhub';

function formatReleaseDate(date: Date | null): string {
  if (!date) return 'Latest Release';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [publishedReleases, setPublishedReleases] = useState<ApkRelease[]>([]);
  const [ownerReleases, setOwnerReleases] = useState<ApkRelease[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(true);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    id: string;
    label: string;
    percent: number;
  } | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [copiedShaId, setCopiedShaId] = useState<string | null>(null);

  const isOwner = isVerifiedOwner(user);

  // Firebase Auth listener — strictly allow only kadir25.bd@gmail.com to stay logged in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && !isVerifiedOwner(currentUser)) {
        await signOut(auth);
        setUser(null);
        setAuthLoading(false);
        setAuthNotice(
          `Only ${OWNER_EMAIL} can sign in to upload APKs. Visitors can download the APK directly without logging in.`
        );
        return;
      }
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Public unauthenticated subscription to published APK releases
  useEffect(() => {
    setLoadingReleases(true);
    const unsub = subscribePublishedApkReleases(
      (list) => {
        setPublishedReleases(list);
        setLoadingReleases(false);
      },
      () => {
        setLoadingReleases(false);
      }
    );
    return () => unsub();
  }, []);

  // Owner subscription (includes hidden/draft releases)
  useEffect(() => {
    if (!isOwner) {
      setOwnerReleases([]);
      return;
    }
    const unsub = subscribeAllApkReleasesOwner(
      (list) => setOwnerReleases(list),
      () => {}
    );
    return () => unsub();
  }, [isOwner]);

  const mainRelease = useMemo(() => {
    return publishedReleases.find((r) => r.isMain) || publishedReleases[0] || null;
  }, [publishedReleases]);

  const olderReleases = useMemo(() => {
    if (!mainRelease) return [];
    return publishedReleases.filter((r) => r.id !== mainRelease.id);
  }, [publishedReleases, mainRelease]);

  async function handleOwnerSignIn() {
    setAuthNotice(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!isVerifiedOwner(cred.user)) {
        await signOut(auth);
        setAuthNotice(
          `Access restricted to ${OWNER_EMAIL}. Public visitors do not need to log in to download.`
        );
      }
    } catch (err) {
      setAuthNotice(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setAuthNotice(null);
  }

  async function handleDownload(release: ApkRelease) {
    setDownloadingId(release.id);
    setDownloadStatus(null);
    setDownloadProgress({ id: release.id, label: 'Preparing APK download...', percent: 4 });
    try {
      const res = await downloadApkRelease(release, (label, percent) =>
        setDownloadProgress({ id: release.id, label, percent })
      );
      setDownloadStatus({
        type: 'success',
        text: `Downloaded ${res.fileName} · ${
          res.sha256Verified ? 'SHA-256 Verified' : 'Integrity check complete'
        }`,
      });
    } catch (err) {
      setDownloadStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to download APK.',
      });
    } finally {
      setDownloadingId(null);
      setDownloadProgress(null);
    }
  }

  async function handleCopyChecksum(release: ApkRelease) {
    try {
      await navigator.clipboard.writeText(release.sha256Checksum);
      setCopiedShaId(release.id);
      setTimeout(() => {
        setCopiedShaId((cur) => (cur === release.id ? null : cur));
      }, 2000);
    } catch {
      // Clipboard unsupported
    }
  }

  const mainIconUri = mainRelease ? getIconDataUri(mainRelease.iconBase64) : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        user={user}
        isOwner={isOwner}
        authLoading={authLoading}
        onOwnerSignIn={handleOwnerSignIn}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-10">
        {authNotice && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm px-4 py-3 rounded-xl flex items-center justify-between gap-4">
            <span>{authNotice}</span>
            <button
              type="button"
              onClick={() => setAuthNotice(null)}
              className="min-h-[36px] px-2 font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {downloadStatus && (
          <div
            className={`px-4 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-4 border ${
              downloadStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="truncate">{downloadStatus.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setDownloadStatus(null)}
              className="min-h-[36px] px-2 font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Section 1: Main APK Download Hero */}
        <section id="latest-apk" className="scroll-mt-20">
          {loadingReleases ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" />
              <div className="lg:col-span-5 h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" />
            </div>
          ) : mainRelease ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {mainIconUri ? (
                        <img
                          src={mainIconUri}
                          alt={mainRelease.appName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src="/src/assets/images/thumb_kadir_utility_1794629929717.jpg"
                          alt={mainRelease.appName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-blue-700">
                        Official Release by {CREATOR_HANDLE}
                      </p>
                      <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mt-0.5 text-balance">
                        {mainRelease.appName}
                      </h1>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-600 tabular-nums">
                        <span className="font-semibold text-slate-900">
                          v{mainRelease.versionName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Build {mainRelease.versionCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{mainRelease.fileSizeLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatReleaseDate(mainRelease.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h2 className="text-xs font-semibold text-slate-500">Release Notes</h2>
                    <p className="text-sm sm:text-base text-slate-700 leading-relaxed whitespace-pre-line">
                      {mainRelease.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={downloadingId === mainRelease.id}
                    onClick={() => handleDownload(mainRelease)}
                    className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2.5 px-7 py-3 text-sm sm:text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60 rounded-xl transition-all"
                  >
                    <Download className="w-5 h-5 shrink-0" />
                    <span>
                      {downloadingId === mainRelease.id
                        ? 'Downloading APK...'
                        : `Download APK (v${mainRelease.versionName})`}
                    </span>
                  </button>

                  {downloadProgress && downloadProgress.id === mainRelease.id && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="truncate">{downloadProgress.label}</span>
                        <span className="font-mono tabular-nums">{downloadProgress.percent}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-200"
                          style={{ width: `${downloadProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono truncate">
                        SHA-256: {mainRelease.sha256Checksum.slice(0, 20)}...
                        {mainRelease.sha256Checksum.slice(-12)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyChecksum(mainRelease)}
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium min-h-[36px] px-2"
                    >
                      {copiedShaId === mainRelease.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy SHA-256</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Studio Visual Frame */}
              <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 min-h-[240px]">
                <img
                  src="/src/assets/images/hero_kadirhub_studio_1794629929630.jpg"
                  alt="KadirHub Android APK Studio"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-200">
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>Android Package · Direct Browser Download</span>
                  </div>
                  <p className="font-display text-lg font-bold leading-snug">
                    {mainRelease.fileName}
                  </p>
                  <p className="text-xs text-slate-300">
                    {mainRelease.packageName || 'Official @kadirofficial007 Android Build'} · No
                    login required
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center space-y-3">
              <Package className="w-9 h-9 text-slate-400 mx-auto" />
              <h1 className="font-display text-2xl font-bold text-slate-900">
                KadirHub Android APK
              </h1>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                {isOwner
                  ? 'No APK has been published yet. Upload your first main APK below to make it available for public download.'
                  : `The latest APK build from ${CREATOR_HANDLE} will appear here as soon as it is published.`}
              </p>
            </div>
          )}
        </section>

        {/* Section 2: Owner Release Manager (Visible ONLY on kadir25.bd@gmail.com account, NO password) */}
        {isOwner && user && <OwnerReleaseManager user={user} releases={ownerReleases} />}

        {/* Section 3: APK Update Version History */}
        <section id="version-history" className="scroll-mt-20 space-y-4">
          <div className="flex items-end justify-between gap-4 border-b border-slate-200 pb-3">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                APK Update Version History
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Previous builds and release notes available for direct download without signing in.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
              {publishedReleases.length} release{publishedReleases.length === 1 ? '' : 's'}
            </span>
          </div>

          {publishedReleases.length <= 1 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
              {mainRelease
                ? `v${mainRelease.versionName} (Build ${mainRelease.versionCode}) is currently the only published APK release.`
                : 'No previous APK update versions published yet.'}
            </div>
          ) : (
            <div className="space-y-3">
              {olderReleases.map((rel) => {
                const iconUri = getIconDataUri(rel.iconBase64);
                const isDownloading = downloadingId === rel.id;
                return (
                  <div
                    key={rel.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {iconUri ? (
                            <img
                              src={iconUri}
                              alt={rel.appName}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-slate-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display text-base font-bold text-slate-900">
                            {rel.appName} v{rel.versionName}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            Build {rel.versionCode} · {rel.fileSizeLabel} ·{' '}
                            {formatReleaseDate(rel.createdAt)} ·{' '}
                            <span className="font-mono">{rel.fileName}</span>
                          </p>
                          <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">
                            {rel.description}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownload(rel)}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isDownloading ? 'Downloading...' : `Download v${rel.versionName}`}</span>
                      </button>
                    </div>

                    {downloadProgress && downloadProgress.id === rel.id && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span className="truncate">{downloadProgress.label}</span>
                          <span className="font-mono tabular-nums">
                            {downloadProgress.percent}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all duration-200"
                            style={{ width: `${downloadProgress.percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 4: Android APK Install Guide */}
        <section id="install-guide" className="scroll-mt-20 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="font-display text-xl font-bold text-slate-900">
              How to Install on Android
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                01. Download the APK
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Tap the Download APK button above. The browser automatically checks the SHA-256
                signature before saving the package.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                02. Allow Browser Installs
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Open the downloaded <span className="font-mono">.apk</span> file and allow your
                browser or file manager to install apps if Android prompts you.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
              <h3 className="font-display text-sm font-bold text-slate-900">
                03. Update Smoothly
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Future updates uploaded by {CREATOR_HANDLE} appear right here with release notes and
                higher build numbers.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            KadirHub APK · Published by{' '}
            <span className="font-semibold text-slate-700">{CREATOR_HANDLE}</span> · No visitor
            login required
          </p>
          <div className="flex items-center gap-5">
            <a href="#latest-apk" className="hover:text-slate-900 transition-colors">
              Latest APK
            </a>
            <a href="#version-history" className="hover:text-slate-900 transition-colors">
              Updates
            </a>
            <a href="#install-guide" className="hover:text-slate-900 transition-colors">
              Install Guide
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
