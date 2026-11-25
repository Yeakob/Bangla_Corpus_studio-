import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { DialectName, DialectSelect, ErrorBox, PageTitle, useLoad } from '../components/ui.jsx';

function ReviewCard({ u, onDone }) {
  const { t, te } = useI18n();
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision) {
    setBusy(true);
    setError(null);
    try {
      await api(`/utterances/${u._id}/review`, { method: 'POST', json: { decision, comment: comment || undefined } });
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{u.utteranceId}</span>
        <span className="text-stone-500">{u.speaker?.speakerId} · <DialectName dialect={u.dialect} /> · {te('speechType', u.speechType)} · {(u.end - u.start).toFixed(1)}s</span>
        <span className="text-stone-400">· {u.annotatedBy?.name}</span>
        <Link className="ml-auto text-xs font-semibold text-brand-700 hover:underline" to={`/annotate/${u.recording}`}>context ↗</Link>
      </div>
      <audio controls preload="none" className="h-9 w-full" src={mediaUrl(`/utterances/${u._id}/audio`)} />
      <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="label !mb-0 pt-0.5">{t('dialectText')}</dt><dd className="bn text-base">{u.dialectText}</dd>
        <dt className="label !mb-0 pt-0.5">{t('standardBangla')}</dt><dd className="bn text-base">{u.standardBangla}</dd>
        {u.english && <><dt className="label !mb-0 pt-0.5">{t('english')}</dt><dd>{u.english}</dd></>}
        {u.intent && <><dt className="label !mb-0 pt-0.5">{t('intent')}</dt><dd className="font-mono text-xs">{u.intent}</dd></>}
        {u.vocabulary?.length > 0 && <><dt className="label !mb-0 pt-0.5">{t('vocabulary')}</dt><dd className="bn">{u.vocabulary.map((v) => `${v.term} = ${v.meaning}`).join(' · ')}</dd></>}
      </dl>
      {u.uncertain && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">? {u.uncertainNote || t('uncertain')}</p>}
      {u.reviews?.length > 0 && (
        <p className="text-xs text-stone-500">{u.reviews.map((r) => `${r.reviewer?.name}: ${r.decision}${r.comment ? ` — ${r.comment}` : ''}`).join(' | ')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <input className="input flex-1" placeholder={t('rejectComment')} value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="btn-danger" disabled={busy} onClick={() => decide('rejected')}>{t('reject')}</button>
        <button className="btn-primary" disabled={busy} onClick={() => decide('approved')}>{t('approve')}</button>
      </div>
      <ErrorBox error={error} />
    </div>
  );
}

export default function Review() {
  const { t } = useI18n();
  const [dialect, setDialect] = useState('');
  const [uncertainOnly, setUncertainOnly] = useState(false);
  const { data, error, reload } = useLoad(
    () => api(`/utterances?${new URLSearchParams({ status: 'submitted', limit: '50', ...(dialect && { dialect }), ...(uncertainOnly && { uncertain: 'true' }) })}`),
    [dialect, uncertainOnly]
  );

  return (
    <div className="space-y-4">
      <PageTitle>{t('review')}</PageTitle>
      <div className="flex flex-wrap items-center gap-3">
        <DialectSelect value={dialect} onChange={setDialect} allowAll className="input !w-auto" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={uncertainOnly} onChange={(e) => setUncertainOnly(e.target.checked)} /> {t('uncertainCount')}</label>
      </div>
      <ErrorBox error={error} />
      {data?.length === 0 && <p className="text-sm text-stone-500">{t('nothingToReview')}</p>}
      <div className="space-y-3">
        {data?.map((u) => <ReviewCard key={u._id} u={u} onDone={reload} />)}
      </div>
    </div>
  );
}
