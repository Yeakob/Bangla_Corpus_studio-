import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { ErrorBox, Field } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const { t, lang, toggle } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <img src="/icon.svg" alt="" className="h-8 w-8" />
            {t('appName')}
          </div>
          <button type="button" className="btn-secondary !px-2 !py-1" onClick={toggle}>
            {lang === 'bn' ? 'EN' : 'বাংলা'}
          </button>
        </div>
        <Field label={t('email')}>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t('password')}>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? t('loading') : t('login')}
        </button>
      </form>
    </div>
  );
}
