import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { listQueue, syncQueue } from '../lib/offlineQueue.js';

function useConnection() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const refresh = () => listQueue().then((q) => setPending(q.length)).catch(() => {});
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('cs-queue', refresh);
    refresh();
    syncQueue();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('cs-queue', refresh);
    };
  }, []);
  return { online, pending };
}

export default function Layout() {
  const { user, logout, can, } = useAuth();
  const { t, te, lang, toggle } = useI18n();
  const { online, pending } = useConnection();

  const links = [
    ['/', t('dashboard'), true],
    ['/speakers', t('speakers'), true],
    ['/sessions', t('sessions'), can('interviewer')],
    ['/annotate', t('annotate'), can('annotator')],
    ['/review', t('review'), can('reviewer')],
    ['/export', t('export'), can('reviewer')],
    ['/users', t('users'), can('admin')],
  ].filter((l) => l[2]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2 font-semibold">
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            {t('appName')}
          </div>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-600 hover:bg-stone-100'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className={`badge ${online ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {online ? t('online') : t('offline')}
            </span>
            {pending > 0 && (
              <button className="badge bg-sky-100 text-sky-800" onClick={() => syncQueue()} title={t('syncNow')}>
                {pending} {t('pendingUploads')} ↻
              </button>
            )}
            <button className="btn-secondary !px-2 !py-1" onClick={toggle} title="Language">
              {lang === 'bn' ? 'EN' : 'বাংলা'}
            </button>
            <span className="hidden text-stone-500 md:inline">
              {user?.name} · {te('role', user?.role)}
            </span>
            <button className="btn-secondary !px-2 !py-1" onClick={logout}>
              {t('logout')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
