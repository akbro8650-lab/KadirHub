import { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  Flag,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { sha256HexFromText } from '@/src/lib/crypto';
import {
  adminDeleteCatalogItem,
  adminModerateReview,
  adminUpdateCatalogStatus,
  adminUpdateReportStatus,
  decryptAndDownloadCatalogItem,
  deleteReview,
  grantAdminAccess,
  revokeAdminAccess,
} from '@/src/lib/firestoreService';
import {
  ADMIN_PASSWORD_SHA256,
  AdminRecord,
  CatalogItem,
  CatalogStatus,
  CREATOR_HANDLE,
  ItemReview,
  ModerationReport,
  ReviewModerationStatus,
  ROOT_ADMIN_EMAIL,
} from '@/src/types/kadirhub';

interface AdminDashboardViewProps {
  user: User | null;
  isFirestoreAdmin: boolean;
  isRootAdmin: boolean;
  isUnlocked: boolean;
  onUnlockSuccess: () => void;
  onLock: () => void;
  allItems: CatalogItem[];
  allReviews: ItemReview[];
  reports: ModerationReport[];
  admins: AdminRecord[];
  onSignIn: () => void;
}

type AdminSubTab = 'reports' | 'catalog' | 'reviews' | 'moderators';

export function AdminDashboardView({
  user,
  isFirestoreAdmin,
  isRootAdmin,
  isUnlocked,
  onUnlockSuccess,
  onLock,
  allItems,
  allReviews,
  reports,
  admins,
  onSignIn,
}: AdminDashboardViewProps) {
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [subTab, setSubTab] = useState<AdminSubTab>('reports');

  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const [flagReasons, setFlagReasons] = useState<Record<string, string>>({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [inspectedLinks, setInspectedLinks] = useState<Record<string, string>>({});

  const [newModUid, setNewModUid] = useState('');
  const [newModEmail, setNewModEmail] = useState('');

  const openReports = useMemo(
    () => reports.filter((r) => r.status === 'open'),
    [reports]
  );

  const stats = useMemo(() => {
    const approved = allItems.filter((i) => i.status === 'approved').length;
    const flagged = allItems.filter((i) => i.status === 'flagged').length;
    const totalDownloads = allItems.reduce((s, i) => s + i.downloadCount, 0);
    return {
      openReports: openReports.length,
      approved,
      flagged,
      totalDownloads,
    };
  }, [allItems, openReports.length]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setVerifyingPassword(true);
    try {
      const digest = await sha256HexFromText(passwordInput);
      if (digest === ADMIN_PASSWORD_SHA256) {
        setPasswordInput('');
        onUnlockSuccess();
      } else {
        setPasswordError('Incorrect admin password.');
      }
    } finally {
      setVerifyingPassword(false);
    }
  }

  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto py-8">
        <form
          onSubmit={handlePasswordSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5"
        >
          <div className="space-y-1.5">
            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <KeyRound className="w-5 h-5" />
            </div>
            <h1 className="font-display text-xl font-bold text-slate-900 pt-2">
              KadirHub Admin Dashboard
            </h1>
            <p className="text-sm text-slate-600">
              Enter the administrator password to unlock the content moderation queue, catalog
              controls, and review moderation tools.
            </p>
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-medium text-slate-700 mb-1">
              Admin Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter admin password"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {passwordError && (
            <p className="text-xs font-medium text-red-600">{passwordError}</p>
          )}

          <button
            type="submit"
            disabled={verifyingPassword}
            className="w-full py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors"
          >
            {verifyingPassword ? 'Verifying...' : 'Unlock Admin Console'}
          </button>
        </form>
      </div>
    );
  }

  async function handleInspectItem(item: CatalogItem) {
    setActionMessage(null);
    try {
      const res = await decryptAndDownloadCatalogItem(item);
      if (res.type === 'link' && res.url) {
        setInspectedLinks((prev) => ({ ...prev, [item.id]: res.url! }));
      } else {
        setActionMessage(
          `Decrypted ${res.fileName || item.title} (${
            res.checksumVerified ? 'SHA-256 Verified' : 'Checksum Notice'
          })`
        );
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Unable to decrypt item.');
    }
  }

  async function handleSetCatalogStatus(item: CatalogItem, status: CatalogStatus) {
    setActionBusyId(item.id);
    setActionMessage(null);
    try {
      await adminUpdateCatalogStatus(item, status);
      setActionMessage(`Updated "${item.title}" to ${status}.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDeleteItem(item: CatalogItem) {
    setActionBusyId(item.id);
    setActionMessage(null);
    try {
      await adminDeleteCatalogItem(item);
      setActionMessage(`Deleted "${item.title}".`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleResolveReport(
    report: ModerationReport,
    nextStatus: 'resolved' | 'dismissed',
    targetAction?: 'flag_target' | 'archive_target'
  ) {
    setActionBusyId(report.id);
    setActionMessage(null);
    try {
      const notes = reportNotes[report.id] ?? report.adminNotes ?? '';
      if (targetAction && report.targetType === 'catalog_item') {
        const targetItem = allItems.find((i) => i.id === report.targetId);
        if (targetItem) {
          await adminUpdateCatalogStatus(
            targetItem,
            targetAction === 'archive_target' ? 'archived' : 'flagged'
          );
        }
      } else if (targetAction && report.targetType === 'review') {
        const targetReview = allReviews.find((r) => r.id === report.targetId);
        if (targetReview) {
          await adminModerateReview(
            targetReview,
            targetAction === 'archive_target' ? 'hidden' : 'flagged',
            report.reason
          );
        }
      }
      await adminUpdateReportStatus(report.id, nextStatus, notes);
      setActionMessage(`Report ${nextStatus}.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to process report.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleModerateReview(
    review: ItemReview,
    status: ReviewModerationStatus
  ) {
    setActionBusyId(review.id);
    setActionMessage(null);
    try {
      await adminModerateReview(
        review,
        status,
        flagReasons[review.id] ?? review.flagReason ?? ''
      );
      setActionMessage(`Updated review status to ${status}.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to moderate review.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleGrantModerator(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setActionMessage(null);
    try {
      await grantAdminAccess(newModUid, newModEmail, user.uid);
      setNewModUid('');
      setNewModEmail('');
      setActionMessage('Moderator access added to /admins.');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to add moderator.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Admin & Content Moderation Console
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Moderate reported items and reviews, manage {CREATOR_HANDLE} catalog status, and
            control Firestore moderator privileges.
          </p>
        </div>
        <button
          type="button"
          onClick={onLock}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Lock Admin</span>
        </button>
      </div>

      {/* Auth / RBAC verification */}
      {!user ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Admin password verified. Sign in with Google ({ROOT_ADMIN_EMAIL}) to load the full
              moderation queue and perform admin writes.
            </span>
          </div>
          <button
            type="button"
            onClick={onSignIn}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            Sign in with Google
          </button>
        </div>
      ) : !isFirestoreAdmin ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-2.5 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            Signed in as <span className="font-mono font-semibold">{user.email}</span> (UID:{' '}
            <span className="font-mono">{user.uid}</span>). Server-side admin writes require{' '}
            {ROOT_ADMIN_EMAIL} or an entry in <span className="font-mono">/admins</span>.
          </span>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Firestore Moderator Active: <span className="font-semibold">{user.email}</span>
          </span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="px-5 py-4">
          <p className="text-xs text-slate-500">Open Moderation Reports</p>
          <p className="mt-1 text-2xl font-display font-bold text-amber-700 tabular-nums">
            {stats.openReports}
          </p>
        </div>
        <div className="px-5 py-4 border-l border-slate-200 lg:border-l-0">
          <p className="text-xs text-slate-500">Approved Releases</p>
          <p className="mt-1 text-2xl font-display font-bold text-emerald-700 tabular-nums">
            {stats.approved}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-slate-500">Flagged Items</p>
          <p className="mt-1 text-2xl font-display font-bold text-red-700 tabular-nums">
            {stats.flagged}
          </p>
        </div>
        <div className="px-5 py-4 border-l border-slate-200 lg:border-l-0">
          <p className="text-xs text-slate-500">Total Downloads</p>
          <p className="mt-1 text-2xl font-display font-bold text-slate-900 tabular-nums">
            {stats.totalDownloads.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit overflow-x-auto">
        <button
          type="button"
          onClick={() => setSubTab('reports')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            subTab === 'reports' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Moderation Queue ({openReports.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('catalog')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            subTab === 'catalog' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Catalog ({allItems.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('reviews')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            subTab === 'reviews' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Reviews ({allReviews.length})
        </button>
        {isRootAdmin && (
          <button
            type="button"
            onClick={() => setSubTab('moderators')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'moderators' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Moderators ({admins.length})
          </button>
        )}
      </div>

      {actionMessage && (
        <div className="bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-slate-300 hover:text-white ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Moderation Reports Queue */}
      {subTab === 'reports' && (
        <div className="space-y-4">
          {reports.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                No moderation reports
              </h2>
              <p className="text-sm text-slate-500">
                Community reports submitted on catalog items or reviews will appear here.
              </p>
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      {report.targetTitle}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {report.targetType === 'catalog_item' ? 'Catalog Item' : 'User Review'} ·
                      Reported by {report.reporterName} · Status:{' '}
                      <span className="font-semibold capitalize text-slate-800">
                        {report.status}
                      </span>
                    </p>
                    <p className="text-sm text-slate-700 mt-2">Reason: {report.reason}</p>
                  </div>
                </div>

                {report.status === 'open' && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
                    <input
                      type="text"
                      value={reportNotes[report.id] ?? report.adminNotes}
                      onChange={(e) =>
                        setReportNotes((prev) => ({ ...prev, [report.id]: e.target.value }))
                      }
                      placeholder="Admin notes..."
                      className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={!isFirestoreAdmin || actionBusyId === report.id}
                        onClick={() => handleResolveReport(report, 'resolved', 'flag_target')}
                        className="px-3 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg"
                      >
                        Flag Content & Resolve
                      </button>
                      <button
                        type="button"
                        disabled={!isFirestoreAdmin || actionBusyId === report.id}
                        onClick={() => handleResolveReport(report, 'dismissed')}
                        className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg"
                      >
                        Dismiss Report
                      </button>
                    </div>
                  </div>
                )}

                {report.status !== 'open' && report.adminNotes && (
                  <p className="text-xs text-slate-500">Admin note: {report.adminNotes}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Catalog Management */}
      {subTab === 'catalog' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Rating</th>
                  <th className="py-3 px-4 text-right">Downloads</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {allItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-500">
                        {item.category} · v{item.version} · {item.fileSizeLabel}
                      </p>
                      {inspectedLinks[item.id] && (
                        <a
                          href={inspectedLinks[item.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-blue-700 hover:underline inline-flex items-center gap-1 mt-1 break-all"
                        >
                          <span>{inspectedLinks[item.id]}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-600">
                      {item.itemType}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium">
                      {item.status === 'approved' && (
                        <span className="text-emerald-700">Approved</span>
                      )}
                      {item.status === 'flagged' && (
                        <span className="text-red-700">Flagged</span>
                      )}
                      {item.status === 'archived' && (
                        <span className="text-slate-600">Archived</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-mono tabular-nums text-slate-700">
                      {item.reviewCount > 0
                        ? `${item.averageRating.toFixed(1)} (${item.reviewCount})`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-mono tabular-nums text-slate-700">
                      {item.downloadCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleInspectItem(item)}
                          title="Decrypt & inspect payload"
                          className="p-1.5 text-slate-500 hover:text-blue-600 rounded transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {item.status !== 'approved' && (
                          <button
                            type="button"
                            disabled={!isFirestoreAdmin || actionBusyId === item.id}
                            onClick={() => handleSetCatalogStatus(item, 'approved')}
                            title="Approve"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {item.status !== 'flagged' && (
                          <button
                            type="button"
                            disabled={!isFirestoreAdmin || actionBusyId === item.id}
                            onClick={() => handleSetCatalogStatus(item, 'flagged')}
                            title="Flag"
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          >
                            <Flag className="w-4 h-4" />
                          </button>
                        )}
                        {item.status !== 'archived' && (
                          <button
                            type="button"
                            disabled={!isFirestoreAdmin || actionBusyId === item.id}
                            onClick={() => handleSetCatalogStatus(item, 'archived')}
                            title="Archive"
                            className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!isFirestoreAdmin || actionBusyId === item.id}
                          onClick={() => handleDeleteItem(item)}
                          title="Delete"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reviews Moderation */}
      {subTab === 'reviews' && (
        <div className="space-y-3">
          {allReviews.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              No reviews found in /reviews.
            </div>
          ) : (
            allReviews.map((rev) => (
              <div
                key={rev.id}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {rev.itemTitle || rev.itemId} — {rev.authorName} ({rev.rating}/5)
                    </p>
                    <p className="text-xs text-slate-500">
                      Status:{' '}
                      <span className="font-semibold capitalize">{rev.moderationStatus}</span>
                      {rev.flagReason && ` · Reason: ${rev.flagReason}`}
                    </p>
                    <p className="text-sm text-slate-700 mt-1">{rev.comment}</p>
                  </div>

                  <button
                    type="button"
                    disabled={!isFirestoreAdmin || actionBusyId === rev.id}
                    onClick={() => deleteReview(rev.id, rev.itemId)}
                    title="Delete review"
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <input
                    type="text"
                    value={flagReasons[rev.id] ?? rev.flagReason}
                    onChange={(e) =>
                      setFlagReasons((prev) => ({ ...prev, [rev.id]: e.target.value }))
                    }
                    placeholder="Optional flag/hide reason..."
                    className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={!isFirestoreAdmin || actionBusyId === rev.id}
                    onClick={() => handleModerateReview(rev, 'visible')}
                    className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                  >
                    Visible
                  </button>
                  <button
                    type="button"
                    disabled={!isFirestoreAdmin || actionBusyId === rev.id}
                    onClick={() => handleModerateReview(rev, 'flagged')}
                    className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"
                  >
                    Flag
                  </button>
                  <button
                    type="button"
                    disabled={!isFirestoreAdmin || actionBusyId === rev.id}
                    onClick={() => handleModerateReview(rev, 'hidden')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Hide</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Moderators Tab */}
      {subTab === 'moderators' && isRootAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleGrantModerator}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-600" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Grant Firestore Moderator Role
              </h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Firebase User UID
              </label>
              <input
                type="text"
                required
                value={newModUid}
                onChange={(e) => setNewModUid(e.target.value)}
                placeholder="Paste user's Firebase UID"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Google Email
              </label>
              <input
                type="email"
                required
                value={newModEmail}
                onChange={(e) => setNewModEmail(e.target.value)}
                placeholder="moderator@gmail.com"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Add Moderator
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Delegated Moderators
            </h2>
            {admins.length === 0 ? (
              <p className="text-sm text-slate-500">
                Only root creator ({ROOT_ADMIN_EMAIL}) currently has Firestore admin privileges.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {admins.map((adm) => (
                  <div key={adm.uid} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {adm.email || 'Moderator'}
                      </p>
                      <p className="text-xs font-mono text-slate-500 truncate">{adm.uid}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revokeAdminAccess(adm.uid)}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
