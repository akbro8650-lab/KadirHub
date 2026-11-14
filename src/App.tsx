import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { AdminDashboardView } from '@/src/components/AdminDashboardView';
import { DirectoryView } from '@/src/components/DirectoryView';
import { EntryDetailModal } from '@/src/components/EntryDetailModal';
import { SubmitView } from '@/src/components/SubmitView';
import { TopBar } from '@/src/components/TopBar';
import { VaultView } from '@/src/components/VaultView';
import { auth, googleProvider } from '@/src/lib/firebase';
import {
  checkIsFirestoreAdmin,
  isUserRootAdmin,
  subscribeAdmins,
  subscribeAllCatalogItemsAdmin,
  subscribeAllReviewsAdmin,
  subscribeApprovedCatalogItems,
  subscribeModerationReportsAdmin,
} from '@/src/lib/firestoreService';
import {
  AdminRecord,
  CatalogItem,
  CREATOR_HANDLE,
  ItemReview,
  ModerationReport,
  ViewTab,
} from '@/src/types/kadirhub';

const ADMIN_SESSION_KEY = 'kadirhub_admin_unlocked';

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>('directory');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isFirestoreAdmin, setIsFirestoreAdmin] = useState(false);
  const [isRootAdmin, setIsRootAdmin] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [approvedItems, setApprovedItems] = useState<CatalogItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [adminItems, setAdminItems] = useState<CatalogItem[]>([]);
  const [adminReviews, setAdminReviews] = useState<ItemReview[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        const root = isUserRootAdmin(currentUser);
        const adminFlag = await checkIsFirestoreAdmin(currentUser);
        setIsRootAdmin(root);
        setIsFirestoreAdmin(adminFlag);
      } else {
        setIsRootAdmin(false);
        setIsFirestoreAdmin(false);
        setApprovedItems([]);
        setAdminItems([]);
        setAdminReviews([]);
        setReports([]);
        setAdmins([]);
      }
    });
    return () => unsub();
  }, []);

  // Authenticated catalog_items subscription (rules require signed-in user + status == "approved")
  useEffect(() => {
    if (authLoading || !user) return;
    setItemsLoading(true);
    const unsubItems = subscribeApprovedCatalogItems(
      (items) => {
        setApprovedItems(items);
        setItemsLoading(false);
      },
      () => setItemsLoading(false)
    );

    return () => {
      unsubItems();
    };
  }, [authLoading, user?.uid]);

  // Admin subscriptions (only attached when authenticated as admin)
  useEffect(() => {
    if (authLoading || !user || !isFirestoreAdmin) return;

    const unsubAllItems = subscribeAllCatalogItemsAdmin(
      (items) => setAdminItems(items),
      () => {}
    );
    const unsubAllReviews = subscribeAllReviewsAdmin(
      (revs) => setAdminReviews(revs),
      () => {}
    );
    const unsubReports = subscribeModerationReportsAdmin(
      (reps) => setReports(reps),
      () => {}
    );
    const unsubAdmins = isRootAdmin
      ? subscribeAdmins(
          (list) => setAdmins(list),
          () => {}
        )
      : () => {};

    return () => {
      unsubAllItems();
      unsubAllReviews();
      unsubReports();
      unsubAdmins();
    };
  }, [authLoading, user?.uid, isFirestoreAdmin, isRootAdmin]);

  const effectiveAdminItems = isFirestoreAdmin ? adminItems : approvedItems;
  const openReportsCount = isFirestoreAdmin
    ? reports.filter((r) => r.status === 'open').length
    : 0;

  const myUploads = useMemo(() => {
    if (!user) return [];
    const pool = isFirestoreAdmin ? adminItems : approvedItems;
    return pool.filter((item) => item.uploaderUid === user.uid);
  }, [user, isFirestoreAdmin, adminItems, approvedItems]);

  const encryptedCatalogItems = useMemo(
    () => approvedItems.filter((item) => item.itemType === 'encrypted_file'),
    [approvedItems]
  );

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return (
      approvedItems.find((i) => i.id === selectedItemId) ||
      adminItems.find((i) => i.id === selectedItemId) ||
      null
    );
  }, [selectedItemId, approvedItems, adminItems]);

  async function handleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  function handleUnlockSuccess() {
    setAdminUnlocked(true);
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }

  function handleLockAdmin() {
    setAdminUnlocked(false);
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        user={user}
        authLoading={authLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        pendingModerationCount={openReportsCount}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {authError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{authError}</span>
            <button type="button" onClick={() => setAuthError(null)} className="underline ml-4">
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'directory' && (
          <DirectoryView
            items={approvedItems}
            loading={authLoading || itemsLoading}
            user={user}
            onSelectItem={(item) => setSelectedItemId(item.id)}
            onNavigate={setActiveTab}
            onSignIn={handleSignIn}
          />
        )}

        {activeTab === 'vault' && (
          <VaultView
            user={user}
            encryptedItems={encryptedCatalogItems}
            loading={authLoading || itemsLoading}
            onSignIn={handleSignIn}
          />
        )}

        {activeTab === 'submit' && (
          <SubmitView
            user={user}
            myUploads={myUploads}
            onSignIn={handleSignIn}
            onSelectItem={(item) => setSelectedItemId(item.id)}
          />
        )}

        {activeTab === 'admin' && (
          <AdminDashboardView
            user={user}
            isFirestoreAdmin={isFirestoreAdmin}
            isRootAdmin={isRootAdmin}
            isUnlocked={adminUnlocked}
            onUnlockSuccess={handleUnlockSuccess}
            onLock={handleLockAdmin}
            allItems={effectiveAdminItems}
            allReviews={adminReviews}
            reports={reports}
            admins={admins}
            onSignIn={handleSignIn}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            KadirHub · Curated by <span className="font-semibold text-slate-700">{CREATOR_HANDLE}</span>{' '}
            · AES-256-GCM Shared Firestore Sync
          </p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('directory')}
              className="hover:text-slate-900 transition-colors"
            >
              Directory
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vault')}
              className="hover:text-slate-900 transition-colors"
            >
              Encrypted Vault
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className="hover:text-slate-900 transition-colors"
            >
              Submit Release
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className="hover:text-slate-900 transition-colors"
            >
              Admin Console
            </button>
          </div>
        </div>
      </footer>

      <EntryDetailModal
        item={selectedItem}
        user={user}
        isAdmin={isFirestoreAdmin}
        onClose={() => setSelectedItemId(null)}
        onSignIn={handleSignIn}
      />
    </div>
  );
}
