import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { DialectName, ErrorBox, Field, OkBox, PageTitle, StatusBadge, useLoad } from '../components/ui.jsx';
import { SpeakerForm } from './Speakers.jsx';

function ConsentForm({ speakerId, consent, onSaved }) {
  const { meta } = useAuth();
  const { t, te } = useI18n();
  const [items, setItems] = useState(consent?.items || Object.fromEntries((meta?.CONSENT_ITEMS || []).map((k) => [k, false])));
  const [date, setDate] = useState((consent?.consentDate || new Date().toISOString()).slice(0, 10));
  const [readAloud, setReadAloud] = useState(consent?.readAloud ?? true);
  const [witness, setWitness] = useState(consent?.witnessName || '');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('items', JSON.stringify(items));
      form.append('consentDate', date);
      form.append('readAloud', String(readAloud));
      if (witness) form.append('witnessName', witness);
      if (file) form.append('signedForm', file);
      await api(`/speakers/${speakerId}/consent`, { method: 'POST', form });
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-stone-600">{t('consentHelp')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(meta?.CONSENT_ITEMS || []).map((k) => (
          <label key={k} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
            <input type="checkbox" checked={!!items[k]} onChange={(e) => setItems((s) => ({ ...s, [k]: e.target.checked }))} />
            {te('consent', k)}
            {(k === 'recording' || k === 'transcription') && <span className="ml-auto text-xs text-red-600">*</span>}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('consentDate')}>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label={t('witness')}>
          <input className="input" value={witness} onChange={(e) => setWitness(e.target.value)} />
        </Field>
        <Field label={t('signedForm')}>
          <input type="file" accept="image/*,application/pdf" capture="environment" className="input" onChange={(e) => setFile(e.target.files[0])} required={!consent?.signedFormPath} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} /> {t('readAloud')}
      </label>
      <ErrorBox error={error} />
      <button className="btn-primary" disabled={busy}>{t('saveConsent')}</button>
    </form>
  );
}

function NewSession({ speakerId }) {
  const { meta } = useAuth();
  const { t, te } = useI18n();
  const nav = useNavigate();
  const [f, setF] = useState({ topic: 'everyday', sessionType: 'structured', environment: '', notes: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    try {
      const iv = await api('/interviews', { method: 'POST', json: { speakerId, ...f } });
      nav(`/sessions/${iv._id}`);
    } catch (err) {
      setError(err);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
      <Field label={t('topic')}>
        <select className="input" value={f.topic} onChange={set('topic')}>
          {meta?.TOPICS.map((k) => <option key={k} value={k}>{te('topic', k)}</option>)}
        </select>
      </Field>
      <Field label={t('sessionType')}>
        <select className="input" value={f.sessionType} onChange={set('sessionType')}>
          {meta?.SESSION_TYPES.map((k) => <option key={k} value={k}>{te('sessionType', k)}</option>)}
        </select>
      </Field>
      <Field label={t('environment')}>
        <input className="input" value={f.environment} onChange={set('environment')} />
      </Field>
      <div className="flex items-end">
        <button className="btn-primary w-full">{t('start')} →</button>
      </div>
      <div className="sm:col-span-4"><ErrorBox error={error} /></div>
    </form>
  );
}

export default function SpeakerDetail() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const { can } = useAuth();
  const nav = useNavigate();
  const { data, error, reload } = useLoad(() => api(`/speakers/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [editConsent, setEditConsent] = useState(false);
  const [msg, setMsg] = useState(null);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <p className="text-sm text-stone-500">{t('loading')}</p>;
  const { speaker: s, consent, interviews } = data;

  async function withdraw() {
    if (!confirm(t('withdrawConfirm'))) return;
    const r = await api(`/speakers/${s.speakerId}/withdraw`, { method: 'POST', json: { deleteData: true } });
    setMsg(`${r.speakerId}: ${r.deleted.recordings} recordings, ${r.deleted.utterances} utterances deleted`);
    reload();
  }

  return (
    <div className="space-y-4">
      <PageTitle right={<StatusBadge status={s.consentStatus} />}>
        {s.speakerId} · <DialectName dialect={s.dialect} />
      </PageTitle>
      <OkBox>{msg}</OkBox>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t('speakerInfo')}</h2>
          {can('interviewer') && <button className="btn-secondary !py-1" onClick={() => setEditing((e) => !e)}>{editing ? t('cancel') : '✎'}</button>}
        </div>
        {editing ? (
          <SpeakerForm initial={s} submitLabel={t('save')} onSaved={() => { setEditing(false); reload(); }} />
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="label">{t('upazila')}</dt><dd>{s.upazila} <span className="text-stone-400">({s.upazilaSlug})</span></dd></div>
            <div><dt className="label">{t('ageGroup')}</dt><dd>{s.ageGroup}</dd></div>
            <div><dt className="label">{t('gender')}</dt><dd>{te('gender', s.gender)}</dd></div>
            <div><dt className="label">{t('education')}</dt><dd>{te('education', s.education)}</dd></div>
            <div><dt className="label">{t('yearsInLocality')}</dt><dd>{s.yearsInLocality}</dd></div>
            <div><dt className="label">{t('otherExposure')}</dt><dd>{s.otherDialectExposure.length ? s.otherDialectExposure.map((d, i) => <span key={d}>{i > 0 && ', '}<DialectName dialect={d} /></span>) : '—'}</dd></div>
            {s.notes && <div className="col-span-2"><dt className="label">{t('notes')}</dt><dd>{s.notes}</dd></div>}
          </dl>
        )}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t('consentTitle')}</h2>
          {consent?.signedFormPath && (
            <a className="text-sm font-semibold text-brand-700 hover:underline" href={mediaUrl(`/speakers/${s.speakerId}/consent/form`)} target="_blank" rel="noreferrer">
              {t('viewForm')} ↗
            </a>
          )}
        </div>
        {consent && !editConsent && s.consentStatus !== 'withdrawn' ? (
          <div className="space-y-3">
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {Object.entries(consent.items).map(([k, v]) => (
                <li key={k} className={v ? 'text-emerald-800' : 'text-stone-400 line-through'}>{v ? '✓' : '✗'} {te('consent', k)}</li>
              ))}
            </ul>
            <p className="text-xs text-stone-500">{t('consentDate')}: {consent.consentDate?.slice(0, 10)}{consent.readAloud ? ` · ${t('readAloud')}` : ''}</p>
            <div className="flex flex-wrap gap-2">
              {can('interviewer') && <button className="btn-secondary" onClick={() => setEditConsent(true)}>✎ {t('consent')}</button>}
              {can() && <button className="btn-danger" onClick={withdraw}>{t('withdraw')}</button>}
            </div>
          </div>
        ) : can('interviewer') ? (
          <ConsentForm speakerId={s.speakerId} consent={s.consentStatus === 'withdrawn' ? null : consent} onSaved={() => { setEditConsent(false); reload(); }} />
        ) : (
          <p className="text-sm text-stone-500">{t('none')}</p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">{t('sessions')}</h2>
        {s.consentStatus === 'granted' ? (
          can('interviewer') && <div className="mb-4"><NewSession speakerId={s.speakerId} /></div>
        ) : (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">🔒 {t('recordingLocked')}</p>
        )}
        <ul className="divide-y divide-stone-100">
          {interviews.map((iv) => (
            <li key={iv._id} className="flex items-center justify-between py-2 text-sm">
              <span>{te('topic', iv.topic)} · {te('sessionType', iv.sessionType)} <span className="text-stone-400">· {iv.createdAt.slice(0, 10)} · {iv.interviewer?.name}</span></span>
              <span className="flex items-center gap-2">
                <StatusBadge status={iv.status} />
                {can('interviewer') && <button className="btn-secondary !py-1" onClick={() => nav(`/sessions/${iv._id}`)}>→</button>}
              </span>
            </li>
          ))}
          {interviews.length === 0 && <li className="py-2 text-sm text-stone-500">{t('none')}</li>}
        </ul>
      </section>
    </div>
  );
}
