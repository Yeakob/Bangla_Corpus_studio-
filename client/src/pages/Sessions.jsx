import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { DialectName, DialectSelect, ErrorBox, PageTitle, StatusBadge, useLoad } from '../components/ui.jsx';

export default function Sessions() {
  const { t, te } = useI18n();
  const [dialect, setDialect] = useState('');
  const { data, error } = useLoad(() => api(`/interviews${dialect ? `?dialect=${dialect}` : ''}`), [dialect]);

  return (
    <div className="space-y-4">
      <PageTitle right={<Link className="btn-primary" to="/speakers">+ {t('newSession')}</Link>}>{t('sessions')}</PageTitle>
      <DialectSelect value={dialect} onChange={setDialect} allowAll className="input !w-auto" />
      <ErrorBox error={error} />
      <div className="card overflow-x-auto p-0">
        <table className="data">
          <thead>
            <tr><th>{t('speakers')}</th><th>{t('dialect')}</th><th>{t('topic')}</th><th>{t('sessionType')}</th><th></th><th></th></tr>
          </thead>
          <tbody>
            {data?.map((iv) => (
              <tr key={iv._id}>
                <td className="font-semibold">{iv.speaker?.speakerId}</td>
                <td><DialectName dialect={iv.dialect} /></td>
                <td>{te('topic', iv.topic)}</td>
                <td>{te('sessionType', iv.sessionType)}</td>
                <td><StatusBadge status={iv.status} /></td>
                <td className="text-right"><Link className="font-semibold text-brand-700 hover:underline" to={`/sessions/${iv._id}`}>{t('record')} →</Link></td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-stone-500">{t('none')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
