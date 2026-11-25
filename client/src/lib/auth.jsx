import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const cached = localStorage.getItem('cs_user');
  const [user, setUser] = useState(cached && getToken() ? JSON.parse(cached) : null);
  const [meta, setMeta] = useState(JSON.parse(localStorage.getItem('cs_meta') || 'null'));

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('cs-logout', onLogout);
    return () => window.removeEventListener('cs-logout', onLogout);
  }, []);

  // Refresh user + form enumerations when online; keep cached copies for offline use.
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(({ user }) => {
        setUser(user);
        localStorage.setItem('cs_user', JSON.stringify(user));
      })
      .catch(() => {});
    api('/meta')
      .then((m) => {
        setMeta(m);
        localStorage.setItem('cs_meta', JSON.stringify(m));
      })
      .catch(() => {});
  }, [user?.id]);

  async function login(email, password) {
    const { token, user } = await api('/auth/login', { method: 'POST', json: { email, password } });
    setToken(token);
    localStorage.setItem('cs_user', JSON.stringify(user));
    setUser(user);
  }
  function logout() {
    setToken(null);
    localStorage.removeItem('cs_user');
    setUser(null);
  }
  const can = (...roles) => !!user && (user.role === 'admin' || roles.includes(user.role));

  return <AuthCtx.Provider value={{ user, meta, login, logout, can }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
