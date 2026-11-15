import { User } from 'firebase/auth';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';

interface TopBarProps {
  user: User | null;
  isOwner: boolean;
  authLoading: boolean;
  onOwnerSignIn: () => void;
  onSignOut: () => void;
}

export function TopBar({
  user,
  isOwner,
  authLoading,
  onOwnerSignIn,
  onSignOut,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <a
          href="#latest-apk"
          className="min-h-[44px] flex items-center font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          KadirHub
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          <a
            href="#latest-apk"
            className="py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Latest APK
          </a>
          <a
            href="#version-history"
            className="py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Updates
          </a>
          <a
            href="#install-guide"
            className="py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Install Guide
          </a>
          {isOwner && (
            <a
              href="#owner-panel"
              className="py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Upload APK
            </a>
          )}
        </nav>

        {/* Zone 3: 1 primary action (Owner sign-in / sign-out) */}
        <div className="flex items-center shrink-0">
          {authLoading ? (
            <div className="h-10 w-28 bg-slate-100 rounded-lg animate-pulse" aria-hidden="true" />
          ) : isOwner && user ? (
            <button
              type="button"
              onClick={onSignOut}
              title={`Signed in as ${user.email}`}
              className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="max-w-[140px] truncate">{user.email}</span>
              <LogOut className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOwnerSignIn}
              className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Owner Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
