import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmtDuration, mediaUrl } from '../lib/api.js';
import { useI18n, PROMPTS } from '../lib/i18n.jsx';
import { startRecorder } from '../lib/recorder.js';
import { enqueue, listQueue, syncQueue, retryFailed, removeFromQueue, downloadBlob } from '../lib/offlineQueue.js';
import { DialectName, ErrorBox, PageTitle, StatusBadge, useLoad } from '../components/ui.jsx';

function Recorder({ interviewId, label, onSaved }) {
  const { t } = useI18n();
  const rec = useRef(null);
  const [state, setState] = useState('idle'); // idle | recording | saving
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [hot, setHot] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => setElapsed(rec.current?.elapsed() || 0), 250);
    return () => clearInterval(id);
  }, [state]);

  // Do not lose a recording by navigating away mid-session.
  useEffect(() => {
    if (state !== 'recording') return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  async function start() {
    setError(null);
    try {
      rec.current = await startRecorder({
        onLevel: (p) => {
          setLevel(p);
          if (p >= 0.99) setHot(true);
        },
      });
      setHot(false);
      setElapsed(0);
      setState('recording');
    } catch (e) {
      setError(new Error(`${t('micError')} (${e.message})`));
    }
  }

  async function stop() {
    setState('saving');
    try {
      const { blob, durationSec } = await rec.current.stop();
      const clientId = crypto.randomUUID();
      await enqueue({ clientId, interviewId, blob, durationSec, recordedAt: rec.current.startedAt, label });
      onSaved?.();
      syncQueue();
    } catch (e) {
      setError(e);
    } finally {
      setState('idle');
      setLevel(0);
    }
  }

  const bars = Math.round(Math.min(1, level * 1.4) * 20);
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        {state === 'recording' ? (
          <button className="btn-danger h-14 min-w-40 text-base" onClick={stop}>■ {t('stop')}</button>
        ) : (
          <button className="btn-primary h-14 min-w-40 text-base" onClick={start} disabled={state === 'saving'}>
            ● {state === 'saving' ? t('loading') : t('record')}
          </button>
        )}
        <div className="font-mono text-2xl tabular-nums">{fmtDuration(elapsed)}</div>
        <div className="flex h-8 items-end gap-0.5" aria-label="input level">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className={`w-1.5 rounded-sm ${i < bars ? (i > 16 ? 'bg-red-500' : i > 12 ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-stone-200'}`} style={{ height: `${30 + i * 3.5}%` }} />
          ))}
        </div>
        {state === 'recording' && <span className="badge animate-pulse bg-red-100 text-red-700">{t('recording')}</span>}
      </div>
      {hot && <p className="text-sm font-semibold text-red-700">⚠ {t('tooLoud')}</p>}
      {elapsed > 20 * 60 && <p className="text-sm text-amber-700">⚠ {t('longWarn')}</p>}
      <p className="text-xs text-stone-500">16 kHz · mono · 16-bit PCM WAV</p>
      <ErrorBox error={error} />
    </div>
  );
}

export default function Session() {
  const { id } = useParams();
  const { t, te } = useI18n();
  // The session is cached on the device so the page still opens with no signal.
  const cacheKey = `cs_session_${id}`;
  const { data, error, reload } = useLoad(
    () =>
      api(`/interviews/${id}`)
        .then((d) => {
          localStorage.setItem(cacheKey, JSON.stringify(d));
          return d;
        })
        .catch((e) => {
          const cached = localStorage.getItem(cacheKey);
          if (cached && (!navigator.onLine || !e.status)) return JSON.parse(cached);
          throw e;
        }),
    [id]
  );
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    let lastCount = null;
    const onQ = () =>
      listQueue().then((q) => {
        const mine = q.filter((x) => x.interviewId === id);
        setQueue(mine);
        // something finished uploading -> refresh the server list
        if (lastCount !== null && mine.length < lastCount && navigator.onLine) reload();
        lastCount = mine.length;
      });
    window.addEventListener('cs-queue', onQ);
    onQ();
    return () => window.removeEventListener('cs-queue', onQ);
  }, [id, reload]);

  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <p className="text-sm text-stone-500">{t('loading')}</p>;
  const { interview: iv, recordings } = data;

  async function complete() {
    await api(`/interviews/${id}`, { method: 'PATCH', json: { status: 'completed' } });
    reload();
  }

  return (
    <div className="space-y-4">
      <PageTitle right={<StatusBadge status={iv.status} />}>
        {iv.speaker.speakerId} · <DialectName dialect={iv.dialect} /> · {te('topic', iv.topic)}
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Recorder interviewId={id} label={`${iv.speaker.speakerId} ${iv.topic}`} />

          <section className="card">
            <h2 className="mb-2 font-semibold">{t('recordings')}</h2>
            <ul className="divide-y divide-stone-100">
              {queue.map((q) => (
                <li key={q.clientId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className={`badge ${q.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-800'}`}>
                    {q.status === 'failed' ? t('failed') : t('savedOnDevice')}
                  </span>
                  <span className="tabular-nums">{fmtDuration(q.durationSec)}</span>
                  <span className="text-stone-500">{new Date(q.recordedAt).toLocaleTimeString()}</span>
                  {q.error && <span className="text-xs text-red-700">{q.error}</span>}
                  <span className="ml-auto flex gap-1">
                    <button className="btn-secondary !py-1" onClick={() => downloadBlob(q.blob, `${q.clientId}.wav`)}>{t('backup')}</button>
                    {q.status === 'failed' ? (
                      <>
                        <button className="btn-secondary !py-1" onClick={() => retryFailed(q.clientId)}>{t('retry')}</button>
                        <button className="btn-secondary !py-1" onClick={() => confirm('Delete from this device?') && removeFromQueue(q.clientId)}>{t('delete')}</button>
                      </>
                    ) : (
                      <button className="btn-secondary !py-1" onClick={() => syncQueue()}>{t('syncNow')}</button>
                    )}
                  </span>
                </li>
              ))}
              {recordings.map((r) => (
                <li key={r._id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="badge bg-emerald-100 text-emerald-800">{t('uploaded')}</span>
                  <span className="tabular-nums">{fmtDuration(r.durationSec)}</span>
                  {r.quality?.clipping && <span className="badge bg-red-100 text-red-700">clipping</span>}
                  {r.quality?.tooQuiet && <span className="badge bg-amber-100 text-amber-800">quiet</span>}
                  <audio controls preload="none" className="ml-auto h-8" src={mediaUrl(`/recordings/${r._id}/audio`)} />
                </li>
              ))}
              {queue.length + recordings.length === 0 && <li className="py-2 text-sm text-stone-500">{t('none')}</li>}
            </ul>
          </section>
          {iv.status === 'open' && <button className="btn-secondary" onClick={complete}>✓ {t('markCompleted')}</button>}
        </div>

        <aside className="card h-fit">
          <h2 className="mb-1 font-semibold">{t('prompts')}</h2>
          <p className="mb-3 text-xs text-stone-500">{t('promptsHelp')}</p>
          <ol className="bn list-decimal space-y-2 pl-5 text-sm">
            {(PROMPTS[iv.topic] || []).map((p) => <li key={p}>{p}</li>)}
          </ol>
        </aside>
      </div>
    </div>
  );
}
