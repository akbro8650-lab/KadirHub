import { User } from 'firebase/auth';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { ViewTab } from '@/src/types/kadirhub';

interface TopBarProps {
  activeTab: ViewTab;
  onChangeTab: (tab: ViewTab) => void;
  user: User | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  pendingModerationCount: number;
}

export function TopBar({
  activeTab,
  onChangeTab,
  user,
  authLoading,
  onSignIn,
  onSignOut,
  pendingModerationCount,
}: TopBarProps) {
  const navItems: { id: ViewTab; label: string }[] = [
    { id: 'directory', label: 'Directory' },
    { id: 'vault', label: 'Encrypted Vault' },
    { id: 'submit', label: 'Submit' },
    { id: 'admin', label: pendingModerationCount > 0 ? `Admin (${pendingModerationCount})` : 'Admin' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line wordmark */}
        <button
          type="button"
          onClick={() => onChangeTab('directory')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
        >
          KadirHub
        </button>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                className={`py-2 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {authLoading ? (
            <div className="h-9 w-28 bg-slate-100 rounded-lg animate-pulse" aria-hidden="true" />
          ) : user ? (
            <button
              type="button"
              onClick={onSignOut}
              title={`Signed in as ${user.email || user.displayName || 'User'}`}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="max-w-[120px] truncate">{user.displayName || 'Account'}</span>
              <LogOut className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>Sign in with Google</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        className="flex md:hidden items-center justify-between gap-2 px-4 pb-2 overflow-x-auto border-t border-slate-100"
        aria-label="Mobile navigation"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`px-2 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
