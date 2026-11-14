import { User } from 'firebase/auth';
import { Compass, Lock, LogIn, LogOut, Shield, ShieldCheck, Upload } from 'lucide-react';
import { ViewTab } from '@/src/types/kadirhub';

interface TopBarProps {
  activeTab: ViewTab;
  onChangeTab: (tab: ViewTab) => void;
  user: User | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  adminBadgeCount: number;
}

export function TopBar({
  activeTab,
  onChangeTab,
  user,
  authLoading,
  onSignIn,
  onSignOut,
  adminBadgeCount,
}: TopBarProps) {
  const navItems: { id: ViewTab; label: string; mobileLabel: string }[] = [
    { id: 'directory', label: 'Explore', mobileLabel: 'Explore' },
    { id: 'vault', label: 'Vault', mobileLabel: 'Vault' },
    { id: 'submit', label: 'Upload', mobileLabel: 'Upload' },
    {
      id: 'admin',
      label: adminBadgeCount > 0 ? `Admin (${adminBadgeCount})` : 'Admin',
      mobileLabel: 'Admin',
    },
  ];

  return (
    <>
      <header className="md:sticky md:top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <button
            type="button"
            onClick={() => onChangeTab('directory')}
            className="min-h-[44px] flex items-center font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
          >
            KadirHub
          </button>

          {/* Zone 2: 4 concise single-line text navigation links (desktop) */}
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
              <div className="h-10 w-28 bg-slate-100 rounded-lg animate-pulse" aria-hidden="true" />
            ) : user ? (
              <button
                type="button"
                onClick={onSignOut}
                title={`Signed in as ${user.email || user.displayName || 'User'}`}
                className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="max-w-[110px] sm:max-w-[140px] truncate">
                  {user.displayName || 'Account'}
                </span>
                <LogOut className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Android-friendly fixed bottom thumb tab bar (< md, <= 8% viewport height) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200"
        aria-label="Mobile thumb navigation"
      >
        <div className="grid grid-cols-4 h-16">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-500 active:text-slate-900'
                }`}
              >
                <div className="relative">
                  {item.id === 'directory' && <Compass className="w-5 h-5" />}
                  {item.id === 'vault' && <Lock className="w-5 h-5" />}
                  {item.id === 'submit' && <Upload className="w-5 h-5" />}
                  {item.id === 'admin' && <Shield className="w-5 h-5" />}
                  {item.id === 'admin' && adminBadgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {adminBadgeCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-medium leading-none">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
