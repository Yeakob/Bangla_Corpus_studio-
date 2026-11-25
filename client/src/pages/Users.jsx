import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { ErrorBox, Field, PageTitle, useLoad } from '../components/ui.jsx';

const ROLES = ['interviewer', 'annotator', 'reviewer', 'admin'];

export default function Users() {
  const { t, te } = useI18n();
  const { user: me } = useAuth();
  const { data, error, reload } = useLoad(() => api('/users'));
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'interviewer' });
  const [formError, setFormError] = useState(null);

  async function create(e) {
    e.preventDefault();
    setFormError(null);
    try {
      await api('/users', { method: 'POST', json: f });
      setF({ name: '', email: '', password: '', role: 'interviewer' });
      reload();
    } catch (err) {
      setFormError(err);
    }
  }
  const patch = (id, body) => api(`/users/${id}`, { method: 'PATCH', json: body }).then(reload).catch(setFormError);

  return (
    <div className="space-y-4">
      <PageTitle>{t('users')}</PageTitle>
      <form onSubmit={create} className="card grid gap-3 sm:grid-cols-5">
        <Field label={t('name')}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label={t('email')}><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label={t('password')}><input type="password" minLength={8} className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <Field label={t('role')}>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{te('role', r)}</option>)}
          </select>
        </Field>
        <div className="flex items-end"><button className="btn-primary w-full">+ {t('addUser')}</button></div>
        <div className="sm:col-span-5"><ErrorBox error={formError} /></div>
      </form>
      <ErrorBox error={error} />
      <div className="card overflow-x-auto p-0">
        <table className="data">
          <thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('role')}</th><th>{t('active')}</th></tr></thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select className="input !w-auto !py-1" value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u.id, { role: e.target.value })}>
                    {ROLES.map((r) => <option key={r} value={r}>{te('role', r)}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={u.active} disabled={u.id === me.id} onChange={(e) => patch(u.id, { active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
