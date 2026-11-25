import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';

/** Load data from the API; returns { data, error, loading, reload }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fn()
      .then((data) => setState({ data, error: null, loading: false }))
      // keep the last good data on screen if a refresh fails (e.g. offline)
      .catch((error) => setState((s) => ({ data: s.data, error, loading: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload };
}

export const ErrorBox = ({ error }) =>
  error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error.message || String(error)}</div> : null;

export const OkBox = ({ children }) =>
  children ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{children}</div> : null;

const STATUS_COLORS = {
  draft: 'bg-stone-100 text-stone-700',
  submitted: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  granted: 'bg-emerald-100 text-emerald-800',
  none: 'bg-stone-100 text-stone-600',
  declined: 'bg-red-100 text-red-700',
  withdrawn: 'bg-red-100 text-red-700',
  pending: 'bg-stone-100 text-stone-700',
  in_progress: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-800',
  open: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
};
export function StatusBadge({ status }) {
  const { te } = useI18n();
  return <span className={`badge ${STATUS_COLORS[status] || 'bg-stone-100'}`}>{te('status', status)}</span>;
}

export function DialectName({ dialect }) {
  const { meta } = useAuth();
  const { lang } = useI18n();
  const d = meta?.dialects?.[dialect];
  if (!d) return dialect;
  return lang === 'bn' ? d.bn : d.district;
}

export function DialectSelect({ value, onChange, allowAll = false, className = 'input' }) {
  const { meta } = useAuth();
  const { t, lang } = useI18n();
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAll && <option value="">{t('all')}</option>}
      {Object.entries(meta?.dialects || {}).map(([k, d]) => (
        <option key={k} value={k}>
          {lang === 'bn' ? d.bn : d.district}
        </option>
      ))}
    </select>
  );
}

export const Field = ({ label, children, hint }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
  </label>
);

export const PageTitle = ({ children, right }) => (
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
    {right}
  </div>
);

export function Progress({ value, max, label }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-stone-600">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-stone-800">
          {value} / {max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
