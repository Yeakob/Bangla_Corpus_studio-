import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { ErrorBox, PageTitle, Progress, StatusBadge, useLoad } from '../components/ui.jsx';

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { data, error, loading } = useLoad(() => api('/stats'));

  return (
    <div>
      <PageTitle>{t('dashboard')}</PageTitle>
      <ErrorBox error={error} />
      {loading && !data && <p className="text-sm text-stone-500">{t('loading')}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {data?.dialects.map((d) => (
          <div key={d.dialect} className="card space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{lang === 'bn' ? d.labelBn : d.label}</h2>
              <span className="text-xs text-stone-500">
                {d.consented} {t('consented')}
              </span>
            </div>
            <Progress label={t('speakersTarget')} value={d.speakers} max={d.targets.speakers} />
            <Progress label={t('hoursRecorded')} value={d.recordedHours} max={d.targets.hours} />
            <Progress label={t('approvedHours')} value={d.approvedHours} max={d.targets.hours} />
            <div>
              <div className="label">{t('utterances')}</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(d.utterances).map(([s, n]) => (
                  <span key={s} className="flex items-center gap-1 text-sm">
                    <StatusBadge status={s} /> <span className="tabular-nums font-semibold">{n}</span>
                  </span>
                ))}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-3 text-xs text-stone-600">
              <dt>{t('flagged')}</dt>
              <dd className={`text-right font-semibold tabular-nums ${d.flaggedRecordings ? 'text-amber-700' : ''}`}>{d.flaggedRecordings}</dd>
              <dt>{t('uncertainCount')}</dt>
              <dd className="text-right font-semibold tabular-nums">{d.uncertain}</dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
