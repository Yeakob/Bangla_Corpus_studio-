import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDuration } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { DialectName, DialectSelect, ErrorBox, PageTitle, StatusBadge, useLoad } from '../components/ui.jsx';

export default function AnnotateList() {
  const { t, te } = useI18n();
  const [dialect, setDialect] = useState('');
  const [status, setStatus] = useState('pending,in_progress');
  const { data, error } = useLoad(async () => {
    const lists = await Promise.all(
      status.split(',').map((s) => api(`/recordings?${new URLSearchParams({ annotationStatus: s, ...(dialect && { dialect }) })}`))
    );
    return lists.flat();
  }, [dialect, status]);

  return (
    <div className="space-y-4">
      <PageTitle>{t('annotationQueue')}</PageTitle>
      <div className="flex flex-wrap gap-2">
        <DialectSelect value={dialect} onChange={setDialect} allowAll className="input !w-auto" />
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending,in_progress">{te('status', 'pending')} + {te('status', 'in_progress')}</option>
          <option value="done">{te('status', 'done')}</option>
        </select>
      </div>
      <ErrorBox error={error} />
      <div className="card overflow-x-auto p-0">
        <table className="data">
          <thead>
            <tr><th>{t('speakers')}</th><th>{t('dialect')}</th><th>{t('topic')}</th><th className="text-right">⏱</th><th className="text-right">{t('utterances')}</th><th></th><th></th></tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r._id}>
                <td className="font-semibold">{r.speaker?.speakerId}</td>
                <td><DialectName dialect={r.dialect} /></td>
                <td>{te('topic', r.interview?.topic)}</td>
                <td className="text-right tabular-nums">{fmtDuration(r.durationSec)}</td>
                <td className="text-right tabular-nums">{r.utterances}</td>
                <td><StatusBadge status={r.annotationStatus} /></td>
                <td className="text-right"><Link className="font-semibold text-brand-700 hover:underline" to={`/annotate/${r._id}`}>{t('annotate')} →</Link></td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-stone-500">{t('none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
