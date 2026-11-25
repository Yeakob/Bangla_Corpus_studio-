import { useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { DialectSelect, ErrorBox, Field, PageTitle } from '../components/ui.jsx';

export default function ExportPage() {
  const { t } = useI18n();
  const [f, setF] = useState({ dialect: '', status: 'approved', publicOnly: false, includeAudio: true, seed: 'corpus-studio-v1' });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const qs = () =>
    new URLSearchParams({ status: f.status, seed: f.seed, publicOnly: String(f.publicOnly), includeAudio: String(f.includeAudio), ...(f.dialect && { dialect: f.dialect }) });

  async function doPreview() {
    setError(null);
    try {
      setPreview(await api(`/export/preview?${qs()}`));
    } catch (e) {
      setPreview(null);
      setError(e);
    }
  }
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/export?${qs()}`, { blob: true });
      const name = res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] || 'corpus.zip';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = name;
      a.click();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle>{t('exportTitle')}</PageTitle>
      <div className="card grid gap-3 sm:grid-cols-4">
        <Field label={t('dialect')}><DialectSelect value={f.dialect} onChange={(v) => setF({ ...f, dialect: v })} allowAll /></Field>
        <Field label={t('statusFilter')}>
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="approved">{t('approvedOnly')}</option>
            <option value="approved,submitted">{t('approvedSubmitted')}</option>
          </select>
        </Field>
        <Field label={t('seed')}><input className="input font-mono" value={f.seed} onChange={(e) => setF({ ...f, seed: e.target.value })} /></Field>
        <div className="space-y-2 pt-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.includeAudio} onChange={(e) => setF({ ...f, includeAudio: e.target.checked })} /> {t('includeAudio')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.publicOnly} onChange={(e) => setF({ ...f, publicOnly: e.target.checked })} /> {t('publicOnly')}</label>
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <button className="btn-secondary" onClick={doPreview}>{t('preview')}</button>
          <button className="btn-primary" onClick={download} disabled={busy}>{busy ? t('loading') : `⬇ ${t('download')}`}</button>
        </div>
      </div>
      <ErrorBox error={error} />
      {preview && (
        <div className="card space-y-3">
          <p className="text-sm">
            <b>{preview.utterances}</b> {t('utterances')} · <b>{preview.speakers}</b> {t('speakers')} · {preview.excludedForConsent} {t('excluded')}
          </p>
          <table className="data">
            <thead><tr><th>Split</th><th className="text-right">{t('utterances')}</th><th className="text-right">h</th><th>{t('speakers')}</th></tr></thead>
            <tbody>
              {Object.entries(preview.splits).map(([k, v]) => (
                <tr key={k}><td className="font-semibold">{k}</td><td className="text-right tabular-nums">{v.utterances}</td><td className="text-right tabular-nums">{v.hours}</td><td className="text-xs">{v.speakers.join(', ') || '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <pre className="max-h-64 overflow-auto rounded-lg bg-stone-900 p-3 text-xs text-stone-100">{preview.sample.map((r) => JSON.stringify(r)).join('\n')}</pre>
        </div>
      )}
    </div>
  );
}
