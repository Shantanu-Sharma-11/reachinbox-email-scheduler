'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Clock, Send, PenSquare, Settings, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard/scheduled', label: 'Scheduled', icon: Clock  },
  { href: '/dashboard/sent',      label: 'Sent',      icon: Send   },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[140px] flex-shrink-0 border-r border-gray-100 flex flex-col py-4">
        {/* Logo */}
        <div className="px-4 mb-6">
          <span className="text-2xl font-extrabold tracking-tight text-gray-900">ON8</span>
        </div>

        {/* Profile Dropdown */}
        <div className="px-3 mb-5 relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left hover:bg-gray-50 rounded-lg px-1 py-1 transition-colors"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
              <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
            </div>
            <ChevronDown className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>

          {profileOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg z-50 overflow-hidden">
              <button
                onClick={logout}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3 h-3" />
                Log out
              </button>
            </div>
          )}
        </div>

        {/* Compose Button */}
        <div className="px-3 mb-5">
          <Link
            href="/dashboard/compose"
            className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <PenSquare className="w-3 h-3" />
            Compose
          </Link>
        </div>

        {/* Core Nav */}
        <div className="px-3">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-2 px-1">Core</p>
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Settings at bottom */}
        <div className="px-3 mt-auto">
          <Link
            href="/dashboard/settings"
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              pathname.startsWith('/dashboard/settings')
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
