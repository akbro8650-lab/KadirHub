import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Flag,
  Lock,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { StarRatingDisplay, StarRatingInput } from '@/src/components/StarRating';
import {
  decryptAndDownloadCatalogItem,
  deleteReview,
  submitModerationReport,
  submitOrUpdateReview,
  subscribeVisibleReviews,
} from '@/src/lib/firestoreService';
import { CatalogItem, ItemReview, MAX_LENGTHS } from '@/src/types/kadirhub';

interface EntryDetailModalProps {
  item: CatalogItem | null;
  user: User | null;
  isAdmin: boolean;
  onClose: () => void;
  onSignIn: () => void;
}

export function EntryDetailModal({
  item,
  user,
  isAdmin,
  onClose,
  onSignIn,
}: EntryDetailModalProps) {
  const [reviews, setReviews] = useState<ItemReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [decryptedLink, setDecryptedLink] = useState<string | null>(null);
  const [downloadDoneName, setDownloadDoneName] = useState<string | null>(null);
  const [checksumVerified, setChecksumVerified] = useState<boolean | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCipherDetails, setShowCipherDetails] = useState(false);

  const [reportTarget, setReportTarget] = useState<{
    type: 'catalog_item' | 'review';
    id: string;
    title: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    if (!item || !user) {
      setReviews([]);
      setReviewsLoading(false);
      return;
    }
    setDecryptedLink(null);
    setDownloadDoneName(null);
    setDownloadError(null);
    setChecksumVerified(null);
    setShowCipherDetails(false);
    setReviewError(null);
    setReportTarget(null);
    setReportMessage(null);
    setReviewsLoading(true);

    const unsub = subscribeVisibleReviews(
      item.id,
      (list) => {
        setReviews(list);
        setReviewsLoading(false);
        if (user) {
          const mine = list.find((r) => r.userId === user.uid);
          if (mine) {
            setRating(mine.rating);
            setComment(mine.comment);
          } else {
            setRating(5);
            setComment('');
          }
        }
      },
      (err) => {
        setReviewsLoading(false);
        setReviewError(err.message);
      }
    );

    return () => unsub();
  }, [item?.id, user?.uid]);

  if (!item) return null;

  const myReview = user ? reviews.find((r) => r.userId === user.uid) : undefined;
  const computedAvg =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : item.averageRating;
  const computedCount = reviews.length > 0 ? reviews.length : item.reviewCount;

  async function handleDownload() {
    if (!item) return;
    setDownloadError(null);
    setDownloadDoneName(null);
    setDownloading(true);
    try {
      const res = await decryptAndDownloadCatalogItem(item);
      setChecksumVerified(res.checksumVerified);
      if (res.type === 'link' && res.url) {
        setDecryptedLink(res.url);
      } else {
        setDownloadDoneName(res.fileName || item.title);
      }
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : 'Unable to decrypt payload with KadirHub VaultKey.'
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyLink() {
    if (!decryptedLink) return;
    await navigator.clipboard.writeText(decryptedLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !user) return;
    setReviewError(null);
    setSubmittingReview(true);
    try {
      await submitOrUpdateReview(item, user, rating, comment);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to post review.');
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleDeleteReview(reviewId: string) {
    if (!item) return;
    setReviewError(null);
    try {
      await deleteReview(reviewId, item.id);
      if (user && reviewId === `${item.id}_${user.uid}`) {
        setComment('');
        setRating(5);
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to delete review.');
    }
  }

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !reportTarget) return;
    setSubmittingReport(true);
    setReportMessage(null);
    try {
      await submitModerationReport(user, {
        targetType: reportTarget.type,
        targetId: reportTarget.id,
        targetTitle: reportTarget.title,
        reason: reportReason,
      });
      setReportReason('');
      setReportTarget(null);
      setReportMessage('Report submitted to the KadirHub moderation queue.');
    } catch (err) {
      setReportMessage(err instanceof Error ? err.message : 'Failed to submit report.');
    } finally {
      setSubmittingReport(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="entry-modal-title" className="font-display text-xl font-bold text-slate-900 truncate">
              {item.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{item.category}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">v{item.version}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{item.fileSizeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{item.creatorHandle}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{item.downloadCount.toLocaleString()} downloads</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Rating + Cipher Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <StarRatingDisplay rating={computedAvg} count={computedCount} size="md" />
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono text-slate-600 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>{item.encryptionAlgorithm}</span>
              </span>
              {user && (
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget({
                      type: 'catalog_item',
                      id: item.id,
                      title: item.title,
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition-colors"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {item.description}
          </p>

          {/* Direct Download / Decryption Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {item.itemType === 'encrypted_file'
                    ? 'Direct AES-256-GCM File Download'
                    : 'Encrypted Destination Link'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-sm">
                  SHA-256: {item.sha256Checksum.slice(0, 24)}...
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {downloading
                    ? 'Decrypting...'
                    : item.itemType === 'encrypted_file'
                    ? 'Decrypt & Download'
                    : 'Decrypt & Open Link'}
                </span>
              </button>
            </div>

            {downloadError && (
              <p className="text-xs font-medium text-red-600">{downloadError}</p>
            )}

            {downloadDoneName && (
              <p className="text-xs font-medium text-emerald-700">
                Decrypted with AES-256-GCM and downloaded {downloadDoneName}
                {checksumVerified ? ' (SHA-256 checksum verified).' : '.'}
              </p>
            )}

            {decryptedLink && (
              <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <a
                  href={decryptedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-blue-700 hover:underline break-all inline-flex items-center gap-1.5"
                >
                  <span>{decryptedLink}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors shrink-0"
                >
                  {copiedLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowCipherDetails((v) => !v)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2"
              >
                {showCipherDetails
                  ? 'Hide Cryptographic Envelope'
                  : 'Inspect AES-256-GCM Ciphertext & SHA-256'}
              </button>
              {showCipherDetails && (
                <div className="mt-2 p-3 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-600 space-y-1 break-all">
                  <div>
                    <span className="text-slate-900 font-semibold">Algorithm:</span>{' '}
                    {item.encryptionAlgorithm}
                  </div>
                  <div>
                    <span className="text-slate-900 font-semibold">SHA-256:</span>{' '}
                    {item.sha256Checksum}
                  </div>
                  <div>
                    <span className="text-slate-900 font-semibold">IV (12-byte Base64):</span>{' '}
                    {item.urlIv}
                  </div>
                  {item.encryptedFileId && (
                    <div>
                      <span className="text-slate-900 font-semibold">Encrypted File ID:</span>{' '}
                      {item.encryptedFileId}
                    </div>
                  )}
                  <div>
                    <span className="text-slate-900 font-semibold">Ciphertext Base64:</span>{' '}
                    {item.encryptedTargetUrl.slice(0, 120)}
                    {item.encryptedTargetUrl.length > 120 ? '...' : ''}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Moderation Report Form */}
          {reportTarget && user && (
            <form
              onSubmit={handleSubmitReport}
              className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-900">
                  Report {reportTarget.type === 'catalog_item' ? 'Release' : 'Review'}:{' '}
                  {reportTarget.title}
                </p>
                <button
                  type="button"
                  onClick={() => setReportTarget(null)}
                  className="text-xs text-amber-800 hover:underline"
                >
                  Cancel
                </button>
              </div>
              <input
                type="text"
                required
                minLength={3}
                maxLength={MAX_LENGTHS.reportReason}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe broken link, malware concern, or spam..."
                className="w-full px-3 py-2 text-sm bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
              <button
                type="submit"
                disabled={submittingReport}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors"
              >
                {submittingReport ? 'Submitting...' : 'Submit Report'}
              </button>
            </form>
          )}

          {reportMessage && (
            <p className="text-xs font-medium text-blue-700">{reportMessage}</p>
          )}

          {/* User Reviews & 5-Star Ratings */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                User Reviews & 5-Star Ratings
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {reviews.length} review{reviews.length === 1 ? '' : 's'}
              </span>
            </div>

            {user ? (
              <form
                onSubmit={handleSubmitReview}
                className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">
                    {myReview ? 'Update your rating & review' : 'Rate this release'}
                  </span>
                  <StarRatingInput value={rating} onChange={setRating} />
                </div>
                <textarea
                  rows={2}
                  maxLength={MAX_LENGTHS.comment}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share hands-on feedback, link verification, or build quality notes..."
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {reviewError && <p className="text-xs font-medium text-red-600">{reviewError}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 tabular-nums">
                    {comment.length}/{MAX_LENGTHS.comment}
                  </span>
                  <button
                    type="submit"
                    disabled={submittingReview || comment.trim().length < 1}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {submittingReview ? 'Saving...' : myReview ? 'Update Review' : 'Post Review'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Sign in with Google to leave a 5-star rating and review.</span>
                </div>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Sign in with Google
                </button>
              </div>
            )}

            {reviewsLoading ? (
              <div className="space-y-2">
                <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              </div>
            ) : reviews.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                No reviews yet. Be the first to rate {item.title}.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {reviews.map((rev) => {
                  const canDelete = Boolean(isAdmin || (user && rev.userId === user.uid));
                  return (
                    <div key={rev.id} className="p-4 flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {rev.authorName}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <StarRatingDisplay rating={rev.rating} />
                          {rev.updatedAt && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="text-xs text-slate-400 tabular-nums">
                                {rev.updatedAt.toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">{rev.comment}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {user && rev.userId !== user.uid && (
                          <button
                            type="button"
                            onClick={() =>
                              setReportTarget({
                                type: 'review',
                                id: rev.id,
                                title: `Review by ${rev.authorName}`,
                              })
                            }
                            title="Report review"
                            className="p-1.5 text-slate-400 hover:text-amber-600 rounded transition-colors"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteReview(rev.id)}
                            title="Delete review"
                            aria-label="Delete review"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
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
    </div>
  );
}
