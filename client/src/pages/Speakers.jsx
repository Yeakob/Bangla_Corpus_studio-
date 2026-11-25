import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDuration } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { DialectName, DialectSelect, ErrorBox, Field, PageTitle, StatusBadge, useLoad } from '../components/ui.jsx';

export function SpeakerForm({ initial, onSaved, submitLabel }) {
  const { meta } = useAuth();
  const { t, te } = useI18n();
  const [f, setF] = useState(
    initial || { dialect: 'cumilla', upazila: '', village: '', ageGroup: '18-30', gender: 'not_stated', education: 'not_stated', yearsInLocality: '20+', otherDialectExposure: [], notes: '' }
  );
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { dialect, ...rest } = f;
      const saved = initial
        ? await api(`/speakers/${initial.speakerId}`, { method: 'PATCH', json: rest })
        : await api('/speakers', { method: 'POST', json: f });
      onSaved(saved);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const toggleExposure = (d) =>
    set('otherDialectExposure')(f.otherDialectExposure.includes(d) ? f.otherDialectExposure.filter((x) => x !== d) : [...f.otherDialectExposure, d]);

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('noNames')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {!initial && (
          <Field label={t('dialect')}>
            <DialectSelect value={f.dialect} onChange={set('dialect')} />
          </Field>
        )}
        <Field label={t('upazila')}>
          <input className="input" value={f.upazila} onChange={set('upazila')} placeholder="Debidwar" required />
        </Field>
        <Field label={t('village')}>
          <input className="input" value={f.village || ''} onChange={set('village')} />
        </Field>
        <Field label={t('ageGroup')}>
          <select className="input" value={f.ageGroup} onChange={set('ageGroup')}>
            {meta?.AGE_GROUPS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label={t('gender')}>
          <select className="input" value={f.gender} onChange={set('gender')}>
            {meta?.GENDERS.map((g) => <option key={g} value={g}>{te('gender', g)}</option>)}
          </select>
        </Field>
        <Field label={t('education')}>
          <select className="input" value={f.education} onChange={set('education')}>
            {meta?.EDUCATION.map((g) => <option key={g} value={g}>{te('education', g)}</option>)}
          </select>
        </Field>
        <Field label={t('yearsInLocality')}>
          <select className="input" value={f.yearsInLocality} onChange={set('yearsInLocality')}>
            {meta?.YEARS_IN_LOCALITY.map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>
      </div>
      <div>
        <span className="label">{t('otherExposure')}</span>
        <div className="flex flex-wrap gap-3">
          {Object.keys(meta?.dialects || {})
            .filter((d) => d !== (initial?.dialect || f.dialect))
            .map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={f.otherDialectExposure.includes(d)} onChange={() => toggleExposure(d)} />
                <DialectName dialect={d} />
              </label>
            ))}
        </div>
      </div>
      <Field label={t('notes')}>
        <textarea className="input" rows={2} value={f.notes || ''} onChange={set('notes')} />
      </Field>
      <ErrorBox error={error} />
      <button className="btn-primary" disabled={busy}>{submitLabel || t('registerSpeaker')}</button>
    </form>
  );
}

export default function Speakers() {
  const { t } = useI18n();
  const { can } = useAuth();
  const nav = useNavigate();
  const [dialect, setDialect] = useState('');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const { data, error, loading } = useLoad(
    () => api(`/speakers?${new URLSearchParams({ ...(dialect && { dialect }), ...(q && { q }) })}`),
    [dialect, q]
  );

  return (
    <div className="space-y-4">
      <PageTitle
        right={can('interviewer') && <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>+ {t('registerSpeaker')}</button>}
      >
        {t('speakers')}
      </PageTitle>
      {showForm && (
        <div className="card">
          <SpeakerForm onSaved={(s) => nav(`/speakers/${s.speakerId}`)} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <DialectSelect value={dialect} onChange={setDialect} allowAll className="input !w-auto" />
        <input className="input !w-64" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorBox error={error} />
      <div className="card overflow-x-auto p-0">
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('dialect')}</th>
              <th>{t('upazila')}</th>
              <th>{t('ageGroup')}</th>
              <th>{t('consent')}</th>
              <th className="text-right">{t('recordings')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s._id} className="hover:bg-stone-50">
                <td><Link className="font-semibold text-brand-700 hover:underline" to={`/speakers/${s.speakerId}`}>{s.speakerId}</Link></td>
                <td><DialectName dialect={s.dialect} /></td>
                <td>{s.upazila}</td>
                <td>{s.ageGroup}</td>
                <td><StatusBadge status={s.consentStatus} /></td>
                <td className="text-right tabular-nums">{s.recordings} · {fmtDuration(s.recordedSec)}</td>
              </tr>
            ))}
            {!loading && data?.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-stone-500">{t('none')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
