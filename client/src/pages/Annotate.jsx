import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { api, fmtDuration, mediaUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { DialectName, ErrorBox, Field, OkBox, PageTitle, StatusBadge } from '../components/ui.jsx';

const COLORS = {
  new: 'rgba(13,148,136,0.28)',
  draft: 'rgba(120,113,108,0.22)',
  submitted: 'rgba(245,158,11,0.25)',
  approved: 'rgba(16,185,129,0.25)',
  rejected: 'rgba(239,68,68,0.25)',
};
const BLANK = { dialectText: '', standardBangla: '', english: '', phonetic: '', intent: '', speechType: 'statement', vocabulary: [], uncertain: false, uncertainNote: '' };

export default function Annotate() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const { meta, can } = useAuth();
  const waveRef = useRef(null);
  const ws = useRef(null);
  const regions = useRef(null);
  const [rec, setRec] = useState(null);
  const [utts, setUtts] = useState([]);
  const [sel, setSel] = useState(null); // { id|null, regionId, start, end, ...fields, status }
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const uttsRef = useRef([]);
  uttsRef.current = utts;

  const loadUtts = useCallback(async () => {
    const list = await api(`/utterances?recording=${id}&limit=1000`);
    setUtts(list);
    return list;
  }, [id]);

  // Draw one region per saved utterance.
  const drawRegions = useCallback((list) => {
    const r = regions.current;
    if (!r) return;
    r.clearRegions();
    for (const u of list) {
      r.addRegion({ id: u._id, start: u.start, end: u.end, color: COLORS[u.status], drag: u.status !== 'approved', resize: u.status !== 'approved', content: u.utteranceId.split('-').pop() });
    }
  }, []);

  useEffect(() => {
    api(`/recordings/${id}`).then(setRec).catch(setError);
  }, [id]);

  useEffect(() => {
    if (!waveRef.current) return;
    const reg = RegionsPlugin.create();
    const w = WaveSurfer.create({
      container: waveRef.current,
      url: mediaUrl(`/recordings/${id}/audio`),
      height: 140,
      waveColor: '#a8a29e',
      progressColor: '#0f766e',
      cursorColor: '#0f172a',
      minPxPerSec: 60,
      normalize: true,
      plugins: [reg],
    });
    ws.current = w;
    regions.current = reg;
    w.on('decode', async () => {
      setReady(true);
      drawRegions(await loadUtts());
      reg.enableDragSelection({ color: COLORS.new });
    });
    w.on('error', (e) => setError(new Error(`Audio: ${e?.message || e}`)));

    reg.on('region-created', (r) => {
      if (uttsRef.current.some((u) => u._id === r.id)) return; // a saved one being drawn
      // only one unsaved segment at a time
      reg.getRegions().forEach((x) => x.id !== r.id && !uttsRef.current.some((u) => u._id === x.id) && x.remove());
      setSel({ ...BLANK, id: null, regionId: r.id, start: r.start, end: r.end, status: 'new' });
    });
    reg.on('region-updated', (r) => {
      setSel((s) => {
        if (s && s.regionId === r.id) return { ...s, start: r.start, end: r.end };
        const u = uttsRef.current.find((x) => x._id === r.id);
        return u ? { ...BLANK, ...u, id: u._id, regionId: u._id, start: r.start, end: r.end } : s;
      });
    });
    reg.on('region-clicked', (r, e) => {
      e.stopPropagation();
      const u = uttsRef.current.find((x) => x._id === r.id);
      if (u) setSel({ ...BLANK, ...u, id: u._id, regionId: u._id });
      r.play();
    });
    return () => w.destroy();
  }, [id, drawRegions, loadUtts]);

  useEffect(() => {
    if (ready) ws.current?.zoom(zoom);
  }, [zoom, ready]);

  // Space = play / pause (but not while typing)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      e.preventDefault();
      ws.current?.playPause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const set = (k) => (e) => setSel((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  async function save(submit) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const body = {
        start: Number(sel.start.toFixed(3)),
        end: Number(sel.end.toFixed(3)),
        dialectText: sel.dialectText,
        standardBangla: sel.standardBangla,
        english: sel.english,
        phonetic: sel.phonetic,
        intent: sel.intent,
        speechType: sel.speechType,
        vocabulary: sel.vocabulary.filter((v) => v.term.trim()),
        uncertain: sel.uncertain,
        uncertainNote: sel.uncertainNote || undefined,
        submit,
      };
      const saved = sel.id
        ? await api(`/utterances/${sel.id}`, { method: 'PATCH', json: body })
        : await api('/utterances', { method: 'POST', json: { ...body, recordingId: id } });
      const list = await loadUtts();
      drawRegions(list);
      const u = list.find((x) => x._id === saved._id);
      setSel(submit ? null : { ...BLANK, ...u, id: u._id, regionId: u._id });
      setMsg(`${saved.utteranceId} · ${te('status', saved.status)}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (sel.id) {
      if (!confirm(`${t('delete')} ${sel.utteranceId}?`)) return;
      await api(`/utterances/${sel.id}`, { method: 'DELETE' }).catch(setError);
    }
    regions.current.getRegions().find((r) => r.id === sel.regionId)?.remove();
    setSel(null);
    drawRegions(await loadUtts());
  }

  async function markDone() {
    const r = await api(`/recordings/${id}`, { method: 'PATCH', json: { annotationStatus: 'done' } }).catch(setError);
    if (r) setRec((x) => ({ ...x, annotationStatus: 'done' }));
  }

  const playSel = () => regions.current.getRegions().find((r) => r.id === sel?.regionId)?.play();
  const locked = sel?.status === 'approved' && !can();
  const lastReview = sel?.reviews?.at?.(-1);

  return (
    <div className="space-y-4">
      <PageTitle right={rec && <StatusBadge status={rec.annotationStatus} />}>
        {rec ? <>{rec.speaker?.speakerId} · <DialectName dialect={rec.dialect} /> · {fmtDuration(rec.durationSec)}</> : t('loading')}
      </PageTitle>

      <div className="card space-y-3">
        <p className="text-xs text-stone-500">{t('dragToSegment')}</p>
        <div ref={waveRef} className="overflow-hidden rounded-lg bg-stone-50" />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={() => ws.current?.playPause()} disabled={!ready}>⏯</button>
          <label className="flex items-center gap-2 text-sm">{t('zoom')}
            <input type="range" min="10" max="400" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <span className="flex flex-wrap gap-2 text-xs">
            {['draft', 'submitted', 'approved', 'rejected'].map((s) => (
              <span key={s} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: COLORS[s] }} />{te('status', s)}</span>
            ))}
          </span>
          {can('annotator') && rec?.annotationStatus !== 'done' && (
            <button className="btn-secondary ml-auto" onClick={markDone}>✓ {t('markDone')}</button>
          )}
        </div>
      </div>

      <ErrorBox error={error} />
      <OkBox>{msg}</OkBox>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          {!sel ? (
            <p className="text-sm text-stone-500">{t('selectSegment')}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{sel.utteranceId || 'New'}</span>
                {sel.status !== 'new' && <StatusBadge status={sel.status} />}
                <span className="tabular-nums text-stone-500">{sel.start.toFixed(2)}s – {sel.end.toFixed(2)}s ({(sel.end - sel.start).toFixed(2)}s)</span>
                <button className="btn-secondary !py-1" onClick={playSel}>▶ {t('playSegment')}</button>
              </div>
              {sel.status === 'rejected' && lastReview?.comment && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><b>{t('reviewerSaid')}:</b> {lastReview.comment}</p>
              )}
              <fieldset disabled={locked} className="space-y-3">
                <Field label={t('dialectText')}>
                  <textarea lang="bn" className="input bn text-base" rows={2} value={sel.dialectText} onChange={set('dialectText')} autoFocus />
                </Field>
                <Field label={t('standardBangla')}>
                  <textarea lang="bn" className="input bn text-base" rows={2} value={sel.standardBangla} onChange={set('standardBangla')} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('english')}><input className="input" value={sel.english} onChange={set('english')} /></Field>
                  <Field label={t('phonetic')}><input className="input" value={sel.phonetic} onChange={set('phonetic')} /></Field>
                  <Field label={t('intent')}><input className="input" value={sel.intent} onChange={set('intent')} placeholder="asking_destination" /></Field>
                  <Field label={t('speechType')}>
                    <select className="input" value={sel.speechType} onChange={set('speechType')}>
                      {meta?.SPEECH_TYPES.map((k) => <option key={k} value={k}>{te('speechType', k)}</option>)}
                    </select>
                  </Field>
                </div>
                <div>
                  <span className="label">{t('vocabulary')}</span>
                  {sel.vocabulary.map((v, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <input lang="bn" className="input bn" placeholder={t('term')} value={v.term} onChange={(e) => set('vocabulary')(sel.vocabulary.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)))} />
                      <input lang="bn" className="input bn" placeholder={t('meaning')} value={v.meaning} onChange={(e) => set('vocabulary')(sel.vocabulary.map((x, j) => (j === i ? { ...x, meaning: e.target.value } : x)))} />
                      <button type="button" className="btn-secondary" onClick={() => set('vocabulary')(sel.vocabulary.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary !py-1" onClick={() => set('vocabulary')([...sel.vocabulary, { term: '', meaning: '', note: '' }])}>+ {t('addWord')}</button>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.uncertain} onChange={set('uncertain')} /> {t('uncertain')}</label>
                {sel.uncertain && <Field label={t('uncertainNote')}><input className="input" value={sel.uncertainNote || ''} onChange={set('uncertainNote')} /></Field>}
              </fieldset>
              {can('annotator') && !locked && (
                <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                  <button className="btn-secondary" disabled={busy} onClick={() => save(false)}>{t('saveDraft')}</button>
                  <button className="btn-primary" disabled={busy} onClick={() => save(true)}>{t('submit')}</button>
                  <button className="btn-secondary ml-auto text-red-700" disabled={busy} onClick={remove}>{t('delete')}</button>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="card h-fit max-h-[70vh] overflow-y-auto p-0">
          <ul className="divide-y divide-stone-100">
            {utts.map((u) => (
              <li key={u._id}>
                <button
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-stone-50 ${sel?.id === u._id ? 'bg-brand-50' : ''}`}
                  onClick={() => { setSel({ ...BLANK, ...u, id: u._id, regionId: u._id }); ws.current?.setTime(u.start); }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{u.utteranceId}</span>
                    <StatusBadge status={u.status} />
                  </div>
                  <div className="bn truncate text-stone-700">{u.dialectText || '—'}</div>
                  <div className="text-xs tabular-nums text-stone-400">{u.start.toFixed(1)}–{u.end.toFixed(1)}s{u.uncertain ? ' · ?' : ''}</div>
                </button>
              </li>
            ))}
            {utts.length === 0 && <li className="px-3 py-4 text-sm text-stone-500">{t('none')}</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
